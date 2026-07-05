import { useEffect, useState } from "react";
import { Save, CheckCircle } from "lucide-react";
import { api, AccountSettings, OllamaStatus, StockfishStatus } from "../lib/tauri";
import { Button, Card, Input, Label } from "../components/ui";

export function SettingsPage() {
  const [settings, setSettings] = useState<AccountSettings>({
    chesscom_username: null,
    lichess_username: null,
    uscf_id: null,
    ollama_model: "llama3.1",
    analysis_depth: 18,
    default_game_count: 100,
  });
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [stockfish, setStockfish] = useState<StockfishStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.checkOllama().then(setOllama);
    api.checkStockfish().then(setStockfish);
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof AccountSettings, value: string | number) => {
    setSettings((s) => ({ ...s, [key]: value || null }));
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b border-[var(--color-border)] px-8 py-5">
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Link your accounts and configure analysis preferences
        </p>
      </header>

      <div className="mx-auto w-full max-w-xl space-y-6 p-8">
        <Card title="Linked Accounts">
          <div className="space-y-4">
            <div>
              <Label>Chess.com Username</Label>
              <Input
                value={settings.chesscom_username ?? ""}
                onChange={(e) => update("chesscom_username", e.target.value)}
                placeholder="your_chesscom_handle"
              />
            </div>
            <div>
              <Label>Lichess Username</Label>
              <Input
                value={settings.lichess_username ?? ""}
                onChange={(e) => update("lichess_username", e.target.value)}
                placeholder="your_lichess_handle"
              />
            </div>
            <div>
              <Label>USCF Member ID</Label>
              <Input
                value={settings.uscf_id ?? ""}
                onChange={(e) => update("uscf_id", e.target.value)}
                placeholder="12345678"
              />
            </div>
          </div>
        </Card>

        <Card title="Analysis Preferences">
          <div className="space-y-4">
            <div>
              <Label>Games to Import per Sync</Label>
              <Input
                type="number"
                min={10}
                max={500}
                value={settings.default_game_count ?? 100}
                onChange={(e) =>
                  update("default_game_count", parseInt(e.target.value) || 100)
                }
              />
            </div>
            <div>
              <Label>Stockfish Analysis Depth</Label>
              <Input
                type="number"
                min={10}
                max={30}
                value={settings.analysis_depth ?? 18}
                onChange={(e) =>
                  update("analysis_depth", parseInt(e.target.value) || 18)
                }
              />
            </div>
          </div>
        </Card>

        <Card title="Stockfish Engine">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {stockfish?.available ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400">Ready</span>
                </>
              ) : (
                <span className="text-amber-400">
                  {stockfish?.error ?? "Not found"}
                </span>
              )}
            </div>
            {stockfish?.path && (
              <p className="text-xs text-[var(--color-muted)] break-all">
                {stockfish.path}
              </p>
            )}
            {!stockfish?.available && (
              <p className="text-xs text-[var(--color-muted)]">
                Run:{" "}
                <code className="rounded bg-[var(--color-surface-3)] px-1">
                  powershell scripts/download-stockfish.ps1
                </code>
              </p>
            )}
          </div>
        </Card>

        <Card title="AI Coach (Ollama)">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {ollama?.connected ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400">Connected</span>
                </>
              ) : (
                <span className="text-amber-400">
                  {ollama?.error ?? "Not connected"}
                </span>
              )}
            </div>
            <div>
              <Label>Default Model</Label>
              <Input
                value={settings.ollama_model ?? "llama3.1"}
                onChange={(e) => update("ollama_model", e.target.value)}
                placeholder="llama3.1"
              />
            </div>
          </div>
        </Card>

        <Button onClick={save} loading={saving} className="w-full">
          {saved ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
