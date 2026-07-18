import type { CoachMessage, OllamaStatus } from "./types";

type ProgressCb = (message: string, percent: number | null) => void;

/** Small instruct model — one-time download, cached in the browser (no API key). */
const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any = null;
let loadPromise: Promise<unknown> | null = null;
let lastProgress: ProgressCb | null = null;

export function setWebCoachProgress(cb: ProgressCb | null) {
  lastProgress = cb;
}

async function loadEngine() {
  if (generator) return generator;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    lastProgress?.("Loading browser AI coach (one-time download)…", 0);
    const { pipeline } = await import("@huggingface/transformers");
    generator = await pipeline("text-generation", MODEL_ID, {
      dtype: "q4",
      device: "wasm",
      progress_callback: (info: {
        status?: string;
        progress?: number;
      }) => {
        if (info.status === "progress" && typeof info.progress === "number") {
          lastProgress?.(
            `Downloading coach model… ${Math.round(info.progress)}%`,
            info.progress,
          );
        } else if (info.status === "done") {
          lastProgress?.("Preparing coach…", 95);
        }
      },
    });
    lastProgress?.("Coach ready", 100);
    return generator;
  })();

  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    generator = null;
    throw e;
  }
}

export async function checkWebCoach(): Promise<OllamaStatus> {
  return {
    connected: true,
    models: [MODEL_ID],
    error: null,
  };
}

export async function warmupWebCoach(onProgress?: ProgressCb): Promise<void> {
  if (onProgress) setWebCoachProgress(onProgress);
  await loadEngine();
}

function buildMessages(
  messages: CoachMessage[],
  profileSummary: string,
): Array<{ role: string; content: string }> {
  return [
    {
      role: "system",
      content: `You are ChessScope AI Coach for USCF/FIDE tournament prep. Be concrete and actionable. Keep answers to 2-4 short paragraphs unless asked for more.

PLAYER STATS:
${profileSummary}`,
    },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];
}

function extractText(result: unknown): string {
  if (!Array.isArray(result) || !result[0]) return "";
  const first = result[0] as {
    generated_text?:
      | string
      | Array<{ role?: string; content?: string }>;
  };
  const gt = first.generated_text;
  if (typeof gt === "string") return gt.trim();
  if (Array.isArray(gt)) {
    const last = [...gt].reverse().find((m) => m.role === "assistant" || m.content);
    return (last?.content ?? "").trim();
  }
  return "";
}

export async function webCoachChat(
  messages: CoachMessage[],
  profileSummary: string,
): Promise<string> {
  const pipe = await loadEngine();
  const chat = buildMessages(messages, profileSummary);
  const result = await pipe(chat, {
    max_new_tokens: 350,
    temperature: 0.7,
    do_sample: true,
  });
  const text = extractText(result);
  if (!text) {
    throw new Error("Browser coach returned an empty reply. Try again.");
  }
  return text;
}

export async function* webCoachStream(
  messages: CoachMessage[],
  profileSummary: string,
): AsyncGenerator<string, void, unknown> {
  const text = await webCoachChat(messages, profileSummary);
  const size = 28;
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
    await new Promise((r) => setTimeout(r, 10));
  }
}
