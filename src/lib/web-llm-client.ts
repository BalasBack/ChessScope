import type { CoachMessage, OllamaStatus } from "./types";

/** Free, no-key text API (Pollinations) — fast enough for website coaching. */
const CHAT_URL = "https://text.pollinations.ai/openai";

export async function checkWebCoach(): Promise<OllamaStatus> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "openai",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });
    clearTimeout(t);
    if (!res.ok) {
      return {
        connected: false,
        models: [],
        error: `AI service unavailable (${res.status}). Try again shortly.`,
      };
    }
    return {
      connected: true,
      models: ["openai"],
      error: null,
    };
  } catch {
    return {
      connected: true, // still allow chat attempts — service may be intermittent
      models: ["openai"],
      error: null,
    };
  }
}

function systemPrompt(profileSummary: string): string {
  return `You are ScoutNScore AI Coach for USCF/FIDE chess tournament prep. Be concrete and actionable. Keep answers to 2-4 short paragraphs unless asked for more.

PLAYER STATS:
${profileSummary}`;
}

export async function webCoachChat(
  messages: CoachMessage[],
  profileSummary: string,
): Promise<string> {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages: [
        { role: "system", content: systemPrompt(profileSummary) },
        ...messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      ],
      temperature: 0.6,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(text || `AI coach error (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI coach returned an empty reply.");
  return content;
}

export async function* webCoachStream(
  messages: CoachMessage[],
  profileSummary: string,
): AsyncGenerator<string, void, unknown> {
  const text = await webCoachChat(messages, profileSummary);
  const size = 32;
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
    await new Promise((r) => setTimeout(r, 8));
  }
}

export async function warmupWebCoach(): Promise<void> {
  // Cloud API — nothing to preload
}

export function setWebCoachProgress(
  _cb: ((message: string, percent: number | null) => void) | null,
) {
  // no-op (kept for Coach.tsx compatibility)
}
