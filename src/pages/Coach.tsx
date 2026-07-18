import { useEffect, useRef, useState } from "react";
import { Send, Bot, User } from "lucide-react";
import { api, CoachMessage, OllamaStatus } from "../lib/tauri";
import { isWebApp } from "../lib/api";
import {
  checkOllama,
  coachChatStream,
  formatCoachProfile,
  warmupModel,
} from "../lib/ollama-client";
import { Button, Card, Input } from "../components/ui";

const SUGGESTIONS = [
  "What are my biggest weaknesses based on my games?",
  "What openings should I focus on this week?",
  "How should I prepare for a USCF rapid tournament?",
  "Give me a 7-day training plan before my next event.",
];

function pickModel(status: OllamaStatus, preferred: string | null): string {
  if (!status.models.length) return preferred ?? "llama3.1";
  if (preferred && status.models.some((m) => m === preferred || m.startsWith(`${preferred}:`))) {
    return status.models.find((m) => m === preferred || m.startsWith(`${preferred}:`))!;
  }
  const small = status.models.find((m) =>
    /phi|gemma|:1b|:3b|mini|small/i.test(m),
  );
  return small ?? status.models[0];
}

export function Coach() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [model, setModel] = useState("llama3.1");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [warming, setWarming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isWebApp()) return;
    Promise.all([checkOllama(), api.getSettings()]).then(([ollama, settings]) => {
      setStatus(ollama);
      const picked = pickModel(ollama, settings.ollama_model);
      setModel(picked);
      if (ollama.connected) {
        setWarming(true);
        warmupModel(picked).finally(() => setWarming(false));
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading || isWebApp()) return;
    const userMsg: CoachMessage = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    setStreamText("");

    let reply = "";
    try {
      const stats = await api.getPlayerStats();
      const profile = formatCoachProfile(stats);
      for await (const chunk of coachChatStream(model, next, profile)) {
        reply += chunk;
        setStreamText(reply);
      }
      setMessages([...next, { role: "assistant", content: reply.trim() }]);
      setStreamText("");
    } catch (e) {
      const partial = reply.trim();
      setMessages([
        ...next,
        {
          role: "assistant",
          content: partial
            ? `${partial}\n\n—(stopped: ${e})`
            : `Error: ${e}. If llama3.1 is slow on your PC, try a smaller model: ollama pull phi3:mini`,
        },
      ]);
      setStreamText("");
    } finally {
      setLoading(false);
    }
  };

  if (isWebApp()) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Bot className="mb-4 h-12 w-12 text-[var(--color-muted)] opacity-40" />
        <h1 className="text-xl font-bold">AI Coach</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">
          AI Coach requires the desktop app with Ollama installed locally.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--color-border)] px-8 py-5">
        <h1 className="text-xl font-bold">AI Coach</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Local coaching via Ollama — powered by your game stats
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          {!status?.connected && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-8 py-3 text-sm text-amber-200">
              {status?.error ??
                "Ollama not connected. Install from ollama.com and run: ollama pull llama3.1"}
            </div>
          )}

          {warming && (
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-8 py-2 text-xs text-[var(--color-muted)]">
              Loading model into memory — first reply is faster after this finishes…
            </div>
          )}

          {loading && !streamText && (
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-8 py-2 text-xs text-[var(--color-muted)]">
              Generating… llama3.1 on CPU can take several minutes. Text will appear as it streams.
            </div>
          )}

          <div className="flex-1 overflow-auto px-8 py-6">
            {messages.length === 0 && !streamText ? (
              <div className="mx-auto max-w-xl space-y-4 pt-8">
                <div className="text-center text-[var(--color-muted)]">
                  <Bot className="mx-auto mb-3 h-12 w-12 opacity-40" />
                  <p>Ask your AI coach anything about tournament preparation.</p>
                </div>
                <div className="grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      disabled={loading || warming || !status?.connected}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-left text-sm hover:border-[var(--color-accent)] disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-4">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
                  >
                    {m.role === "assistant" && (
                      <Bot className="mt-1 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
                    )}
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-[var(--color-accent)] text-white"
                          : "bg-[var(--color-surface-2)] border border-[var(--color-border)]"
                      }`}
                    >
                      {m.content}
                    </div>
                    {m.role === "user" && (
                      <User className="mt-1 h-5 w-5 shrink-0 text-[var(--color-muted)]" />
                    )}
                  </div>
                ))}
                {streamText && (
                  <div className="flex gap-3">
                    <Bot className="mt-1 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
                    <div className="max-w-[85%] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm leading-relaxed">
                      {streamText}
                      <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-[var(--color-accent)]" />
                    </div>
                  </div>
                )}
                {loading && !streamText && (
                  <div className="flex gap-3">
                    <Bot className="h-5 w-5 text-[var(--color-accent)]" />
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-muted)]">
                      Waiting for first token…
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-[var(--color-border)] px-8 py-4">
            <form
              className="mx-auto flex max-w-2xl gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your coach..."
                disabled={loading || warming || !status?.connected}
              />
              <Button
                type="submit"
                loading={loading}
                disabled={!input.trim() || loading || warming || !status?.connected}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        <aside className="w-64 shrink-0 border-l border-[var(--color-border)] p-4 space-y-4">
          <Card title="Model">
            {status?.connected && status.models.length > 0 ? (
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setWarming(true);
                  warmupModel(e.target.value).finally(() => setWarming(false));
                }}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-sm"
              >
                {status.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">
                Connect Ollama to select a model
              </p>
            )}
          </Card>
          <p className="text-xs text-[var(--color-muted)]">
            Tip: <code className="text-[var(--color-text)]">llama3.1</code> is slow on CPU.
            For faster replies run{" "}
            <code className="text-[var(--color-text)]">ollama pull phi3:mini</code>
          </p>
        </aside>
      </div>
    </div>
  );
}
