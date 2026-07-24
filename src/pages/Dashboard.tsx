import { useEffect, useState } from "react";
import { RefreshCw, TrendingUp, Target, Clock, Cpu, AlertTriangle } from "lucide-react";
import { api, AnalysisSummary, PlayerStatsSummary } from "../lib/tauri";
import { Card, Button, StatBox } from "../components/ui";
import { winRate } from "../lib/utils";
import { openingDisplay } from "../lib/chess";

export function Dashboard() {
  const [stats, setStats] = useState<PlayerStatsSummary | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [gameCount, setGameCount] = useState(0);
  const [scoutedCount, setScoutedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      await api.backfillOpenings().catch(() => {});
      const [s, count, scouted, a] = await Promise.all([
        api.getPlayerStats(),
        api.getGameCount(),
        api.getScoutedGameCount(),
        api.getAnalysisSummary(),
      ]);
      setStats(s);
      setGameCount(count);
      setScoutedCount(scouted);
      setAnalysis(a);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const results = await api.syncAll();
      setMessage(results.map((r) => r.message).join(" · "));
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    setMessage(null);
    try {
      const count = await api.analyzePendingGames(5);
      setMessage(`Analyzed ${count} game(s) with Stockfish`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="page-header flex flex-col gap-4 border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-surface-2)] to-transparent px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <h1 className="text-xl font-bold">Chess Tournament Prep Hub</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Stats below are from <strong className="text-[var(--color-text)]">your linked accounts</strong> only
            {scoutedCount > 0 && (
              <> · {scoutedCount} scouted opponent game{scoutedCount !== 1 ? "s" : ""} stored separately</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleAnalyze} loading={analyzing} className="flex-1 sm:flex-none">
            <Cpu className="h-4 w-4" />
            Analyze Games
          </Button>
          <Button onClick={handleSync} loading={syncing} className="flex-1 sm:flex-none">
            <RefreshCw className="h-4 w-4" />
            Sync Games
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-4 sm:p-8">
        {message && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatBox label="Your Games" value={gameCount} sub="Linked accounts only" />
          <StatBox
            label="Analyzed"
            value={analysis?.analyzed_games ?? 0}
            sub={
              analysis && analysis.analyzed_games > 0
                ? `avg −${(analysis.avg_cp_loss / 100).toFixed(1)}/move`
                : "Run Stockfish analysis"
            }
          />
          <StatBox
            label="Blunders Found"
            value={analysis?.total_blunders ?? 0}
            sub={
              analysis
                ? `${analysis.total_mistakes} mistakes · ${analysis.total_inaccuracies} inaccuracies`
                : undefined
            }
          />
          <StatBox
            label="Win Rate"
            value={stats ? winRate(stats.wins, stats.total_games) : "—"}
            sub={
              stats
                ? `${stats.wins}W ${stats.draws}D ${stats.losses}L`
                : undefined
            }
          />
        </div>

        {analysis && analysis.total_blunders > 0 && (
          <Card title="Weakness Alert">
            <div className="flex items-center gap-3 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <span>
                You have <strong>{analysis.total_blunders}</strong> blunders across analyzed
                games. Head to <strong>Training</strong> to practice fixing them.
              </span>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card title="Your Openings — White">
            {stats && stats.openings_as_white.length > 0 ? (
              <div className="space-y-2">
                {stats.openings_as_white.slice(0, 5).map((o) => (
                  <div
                    key={`${o.eco}-${o.name}`}
                    className="flex items-center justify-between rounded-lg bg-[var(--color-surface-3)] px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-mono text-[var(--color-accent)]">
                        {openingDisplay(o.name, o.eco).eco ?? ""}
                      </span>{" "}
                      {openingDisplay(o.name, o.eco).name}
                    </div>
                    <div className="text-[var(--color-muted)]">
                      {o.games}g · {winRate(o.wins, o.games)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyHint icon={Target} text="Sync games to see your White openings" />
            )}
          </Card>

          <Card title="Your Openings — Black">
            {stats && stats.openings_as_black.length > 0 ? (
              <div className="space-y-2">
                {stats.openings_as_black.slice(0, 5).map((o) => (
                  <div
                    key={`${o.eco}-${o.name}`}
                    className="flex items-center justify-between rounded-lg bg-[var(--color-surface-3)] px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-mono text-[var(--color-accent)]">
                        {openingDisplay(o.name, o.eco).eco ?? ""}
                      </span>{" "}
                      {openingDisplay(o.name, o.eco).name}
                    </div>
                    <div className="text-[var(--color-muted)]">
                      {o.games}g · {winRate(o.wins, o.games)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyHint icon={Target} text="Sync games to see your Black openings" />
            )}
          </Card>
        </div>

        <Card title="Performance by Time Control">
          {stats && stats.by_time_class.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.by_time_class.map((tc) => (
                <div
                  key={tc.time_class}
                  className="rounded-lg bg-[var(--color-surface-3)] p-4"
                >
                  <div className="flex items-center gap-2 text-sm font-medium capitalize">
                    <Clock className="h-4 w-4 text-[var(--color-accent)]" />
                    {tc.time_class}
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {winRate(tc.wins, tc.games)}
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {tc.games} games · {tc.wins}W {tc.draws}D {tc.losses}L
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyHint icon={TrendingUp} text="Import games from Settings to populate stats" />
          )}
        </Card>
      </div>
    </div>
  );
}

function EmptyHint({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-[var(--color-muted)]">
      <Icon className="h-8 w-8 opacity-40" />
      {text}
    </div>
  );
}
