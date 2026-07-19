import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Sparkles, X } from "lucide-react";
import { isWebApp } from "../lib/api";
import { Button } from "./ui";

const STORAGE_KEY = "scoutnscore-welcome-dismissed";

export function WelcomeModal() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isWebApp()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      /* private mode — still show once this session */
    }
    setOpen(true);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const goSettings = () => {
    dismiss();
    navigate("/settings");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 shadow-xl">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
          <Sparkles className="h-5 w-5" />
        </div>

        <h2 id="welcome-title" className="text-lg font-bold">
          Welcome to ScoutNScore
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          Start in <strong className="text-[var(--color-text)]">Settings</strong>{" "}
          — link your Chess.com and/or Lichess username (and USCF ID if you have
          one). Everything else builds from that.
        </p>

        <ol className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
          <li>
            <span className="font-medium text-[var(--color-text)]">1. Settings</span>
            {" — "}add your accounts
          </li>
          <li>
            <span className="font-medium text-[var(--color-text)]">2. Dashboard</span>
            {" — "}Sync Games, then Analyze
          </li>
          <li>
            <span className="font-medium text-[var(--color-text)]">3. Prep</span>
            {" — "}Coach, Training, Opponent Scout
          </li>
        </ol>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={dismiss}>
            Maybe Later
          </Button>
          <Button onClick={goSettings}>
            <Settings className="h-4 w-4" />
            Open Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
