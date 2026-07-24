import { useEffect, useState } from "react";
import { Award, Bot, Loader2, Search, Sparkles, TrendingUp } from "lucide-react";
import { api, UscfMember } from "../lib/tauri";
import { isWebApp } from "../lib/api";
import { checkOllama } from "../lib/ollama-client";
import { generateUscfAiSuggestions } from "../lib/uscf-ai";
import { getUscfHistory, recordUscfSnapshot } from "../lib/uscf-history";
import { buildUscfSuggestions, formatSystem } from "../lib/uscf-suggestions";
import type { UscfRatingSnapshot } from "../lib/types";
import {
  UscfRatingBarChart,
  UscfRatingTrendChart,
} from "../components/UscfRatingChart";
import { Button, Card, Input, Label } from "../components/ui";

export function UscfProfile() {
  const [uscfId, setUscfId] = useState("");
  const [member, setMember] = useState<UscfMember | null>(null);
  const [history, setHistory] = useState<UscfRatingSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollamaOk, setOllamaOk] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      if (s.uscf_id) setUscfId(s.uscf_id);
    });
    if (!isWebApp()) checkOllama().then((s) => setOllamaOk(s.connected));
  }, []);

  const lookup = async (id?: string) => {
    const target = (id ?? uscfId).trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    setMember(null);
    setAiText(null);
    try {
      const result = await api.lookupUscf(target);
      setMember(result);
      setUscfId(result.id);
      const h = recordUscfSnapshot(result);
      setHistory(h);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (uscfId) setHistory(getUscfHistory(uscfId));
  }, [uscfId]);

  const runAi = async () => {
    if (!member || isWebApp()) return;
    setAiLoading(true);
    setError(null);
    try {
      const [stats, settings] = await Promise.all([
        api.getPlayerStats(),
        api.getSettings(),
      ]);
      const model = settings.ollama_model ?? "llama3.1:latest";
      const text = await generateUscfAiSuggestions(member, stats, model);
      setAiText(text);
    } catch (e) {
      setError(String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const suggestions = member ? buildUscfSuggestions(member) : [];

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="page-header border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-surface-2)] to-transparent px-4 py-5 sm:px-8">
        <h1 className="text-xl font-bold">USCF Profile</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Ratings, trends, and AI-powered tournament prep for your USCF record
        </p>
      </header>

      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-8">
        <Card title="Member lookup">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label>USCF member ID</Label>
              <Input
                value={uscfId}
                onChange={(e) => setUscfId(e.target.value)}
                placeholder="12345678"
                onKeyDown={(e) => e.key === "Enter" && lookup()}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => lookup()} loading={loading} className="w-full sm:w-auto">
                <Search className="h-4 w-4" />
                Look up
              </Button>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </Card>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-[var(--color-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Fetching USCF profile…
          </div>
        )}

        {member && !loading && (
          <>
            <Card title="Member">
              <div className="flex items-start gap-4">
                <div className="accent-glow rounded-xl bg-[var(--color-accent)]/20 p-3">
                  <Award className="h-8 w-8 text-[var(--color-accent)]" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">
                    {member.first_name} {member.last_name}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
                    <span>ID #{member.id}</span>
                    {member.state && <span>State: {member.state}</span>}
                    {member.fide_id && <span>FIDE #{member.fide_id}</span>}
                    {member.status && <span>Status: {member.status}</span>}
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card title="Rating overview">
                <UscfRatingBarChart member={member} />
              </Card>
              <Card title="Rating trend">
                <UscfRatingTrendChart history={history} />
              </Card>
            </div>

            <Card title="Ratings detail">
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="w-full min-w-[320px] text-sm">
                  <thead className="bg-[var(--color-surface-3)] text-xs text-[var(--color-muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left">System</th>
                      <th className="px-3 py-2 text-right">Rating</th>
                      <th className="px-3 py-2 text-right">Games</th>
                      <th className="px-3 py-2 text-right">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.ratings.map((r) => (
                      <tr
                        key={r.rating_system}
                        className="border-t border-[var(--color-border)]"
                      >
                        <td className="px-3 py-2">{formatSystem(r.rating_system)}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {r.rating ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-[var(--color-muted)]">
                          {r.games_played ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {r.is_provisional ? (
                            <span className="text-amber-400">Provisional</span>
                          ) : (
                            <span className="text-[var(--color-muted)]">Established</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title="AI prep plan"
              action={
                !isWebApp() && (
                  <Button
                    variant="secondary"
                    onClick={runAi}
                    loading={aiLoading}
                    disabled={!ollamaOk}
                  >
                    <Bot className="h-4 w-4" />
                    Generate
                  </Button>
                )
              }
            >
              {isWebApp() ? (
                <p className="text-sm text-[var(--color-muted)]">
                  AI suggestions require the desktop app with Ollama.
                </p>
              ) : !ollamaOk ? (
                <p className="text-sm text-amber-400">
                  Connect Ollama in Settings to generate personalized prep.
                </p>
              ) : aiText ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{aiText}</p>
              ) : aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing your USCF profile and game stats…
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">
                  Combines your USCF ratings with <strong>your</strong> imported game stats
                  (not opponent scout data). Click Generate for a custom study plan.
                </p>
              )}
            </Card>

            <Card title="Rule-based suggestions">
              <div className="space-y-3">
                {suggestions.map((s) => (
                  <div
                    key={s.title}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-3)]/40 p-4"
                  >
                    <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
                      {s.title}
                    </div>
                    <p className="text-sm leading-relaxed text-[var(--color-muted)]">
                      {s.detail}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {history.length >= 2 && (
              <Card title="History">
                <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <TrendingUp className="h-4 w-4" />
                  {history.length} snapshots saved — look up again later to extend your trend chart
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
