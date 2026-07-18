import type { CoachMessage, OllamaStatus, PlayerStatsSummary } from "./types";

const OLLAMA_BASE = "http://127.0.0.1:11434";

/** Compact stats for the system prompt — keeps inference fast on CPU. */
export function formatCoachProfile(stats: PlayerStatsSummary): string {
  const wr =
    stats.total_games > 0
      ? Math.round((stats.wins / stats.total_games) * 100)
      : 0;
  const lines = [
    `Games: ${stats.total_games} (W${stats.wins} D${stats.draws} L${stats.losses}, ${wr}% wins)`,
  ];
  if (stats.openings_as_white.length) {
    const top = stats.openings_as_white
      .slice(0, 5)
      .map((o) => `${o.name} (${o.games}g, ${o.wins}W/${o.losses}L)`)
      .join("; ");
    lines.push(`White openings: ${top}`);
  }
  if (stats.openings_as_black.length) {
    const top = stats.openings_as_black
      .slice(0, 5)
      .map((o) => `${o.name} (${o.games}g, ${o.wins}W/${o.losses}L)`)
      .join("; ");
    lines.push(`Black openings: ${top}`);
  }
  if (stats.by_time_class.length) {
    const tc = stats.by_time_class
      .slice(0, 4)
      .map((t) => `${t.time_class}: ${t.games}g`)
      .join(", ");
    lines.push(`Time controls: ${tc}`);
  }
  return lines.join("\n");
}

async function ollamaFetch(
  path: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    return await fetch(`${OLLAMA_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError" && timeoutMs) {
      throw new Error(`Ollama timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new Error(
      `Cannot reach Ollama at ${OLLAMA_BASE}. Start the Ollama app or run: ollama serve`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkOllama(): Promise<OllamaStatus> {
  try {
    const res = await ollamaFetch("/api/tags", undefined, 5_000);
    if (!res.ok) {
      return {
        connected: false,
        models: [],
        error: `Ollama returned ${res.status}`,
      };
    }
    const data = (await res.json()) as { models: Array<{ name: string }> };
    return {
      connected: true,
      models: data.models.map((m) => m.name),
      error: null,
    };
  } catch (e) {
    return {
      connected: false,
      models: [],
      error: String(e),
    };
  }
}

/** Load model into memory before the first real question. */
export async function warmupModel(model: string): Promise<void> {
  try {
    await ollamaFetch(
      "/api/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "hi" }],
          stream: false,
          options: { num_predict: 1 },
        }),
      },
      300_000,
    );
  } catch {
    /* non-fatal — first chat will load the model instead */
  }
}

function buildSystemPrompt(profileSummary: string): string {
  return `You are ChessScope AI Coach for USCF/FIDE tournament prep.
Be concrete and actionable. Keep answers to 2-4 short paragraphs unless asked for more.

PLAYER STATS:
${profileSummary}`;
}

async function postChat(
  model: string,
  messages: CoachMessage[],
  profileSummary: string,
  stream: boolean,
): Promise<Response> {
  const body = {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(profileSummary) },
      ...messages,
    ],
    stream,
    options: { num_predict: 500, temperature: 0.6 },
  };

  let res = await ollamaFetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 404 && !model.includes(":")) {
    res = await ollamaFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: `${model}:latest` }),
    });
  }

  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(
      text
        ? `Ollama error (${res.status}): ${text}`
        : `Ollama error (${res.status}). Try: ollama pull ${model.split(":")[0]}`,
    );
  }

  return res;
}

/** Stream tokens as they arrive — no fixed end timeout while tokens flow. */
export async function* coachChatStream(
  model: string,
  messages: CoachMessage[],
  profileSummary: string,
): AsyncGenerator<string, void, unknown> {
  const res = await postChat(model, messages, profileSummary, true);
  if (!res.body) throw new Error("Ollama returned no response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      reader.cancel();
    }, 300_000);
  };

  resetIdle();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          if (chunk.message?.content) yield chunk.message.content;
          if (chunk.done) return;
        } catch {
          /* skip malformed line */
        }
      }
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

export async function coachChat(
  model: string,
  messages: CoachMessage[],
  profileSummary: string,
): Promise<string> {
  let out = "";
  for await (const chunk of coachChatStream(model, messages, profileSummary)) {
    out += chunk;
  }
  const content = out.trim();
  if (!content) {
    throw new Error(
      "Ollama returned an empty response. Try a different model in the sidebar.",
    );
  }
  return content;
}
