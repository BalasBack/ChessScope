import { useEffect, useRef, useState } from "react";
import { Send, Bot, User } from "lucide-react";
import { api, CoachMessage, OllamaStatus } from "../lib/tauri";
import { Button, Card, Input } from "../components/ui";

const SUGGESTIONS = [
  "What are my biggest weaknesses based on my games?",
  "What openings should I focus on this week?",
  "How should I prepare for a USCF rapid tournament?",
  "Give me a 7-day training plan before my next event.",
];

export function Coach() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [model, setModel] = useState("llama3.1");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.checkOllama().then(setStatus);
    api.getSettings().then((s) => {
      if (s.ollama_model) setModel(s.ollama_model);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: CoachMessage = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await api.coachChat(model, next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: `Error: ${e}. Make sure Ollama is running (ollama serve) and a model is pulled.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

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

          <div className="flex-1 overflow-auto px-8 py-6">
            {messages.length === 0 ? (
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
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-left text-sm hover:border-[var(--color-accent)]"
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
                {loading && (
                  <div className="flex gap-3">
                    <Bot className="h-5 w-5 text-[var(--color-accent)]" />
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-muted)]">
                      Thinking...
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
                disabled={loading}
              />
              <Button type="submit" loading={loading} disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        <aside className="w-64 shrink-0 border-l border-[var(--color-border)] p-4">
          <Card title="Model">
            {status?.connected && status.models.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-sm"
              >
                {status.models.map((m) => (
                  <option key={m} value={m.split(":")[0]}>
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
        </aside>
      </div>
    </div>
  );
}
