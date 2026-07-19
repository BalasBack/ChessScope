import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  Dumbbell,
  Search,
  Settings,
  Crown,
  Award,
  CircleHelp,
} from "lucide-react";
import { isWebApp } from "../lib/api";
import { cn } from "../lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analysis", label: "Analysis", icon: BarChart3 },
  { to: "/coach", label: "AI Coach", icon: MessageSquare },
  { to: "/training", label: "Training", icon: Dumbbell },
  { to: "/scout", label: "Opponent Scout", icon: Search },
  { to: "/uscf", label: "USCF Profile", icon: Award },
  { to: "/help", label: "Help", icon: CircleHelp },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-surface)]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div className="border-b border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-surface-3)] px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="accent-glow flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)]/20">
              <Crown className="h-5 w-5 text-[var(--color-accent)]" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide">ScoutNScore</div>
              <div className="text-[11px] text-[var(--color-muted)]">
                Chess Tournament Prep
              </div>
              <a
                href="https://www.youtube.com/channel/UCGhv2Iena67AWNrxHr5Cqow"
                className="mt-1 inline-block text-[11px] text-[var(--color-accent)] hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                By BalasBack
              </a>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                  isActive
                    ? "bg-[var(--color-accent)]/15 font-medium text-[var(--color-accent)] shadow-sm"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-[var(--color-border)] p-4 text-[10px] text-[var(--color-muted)]">
          {isWebApp() ? "Web Edition" : "Desktop Edition"}
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">
        {isWebApp() && (
          <div className="border-b border-[var(--color-border)] bg-[var(--color-accent)]/8 px-4 py-2 text-center text-xs text-[var(--color-muted)]">
            Web mode — games stay in this browser.{" "}
            <NavLink to="/help" className="text-[var(--color-accent)] underline">
              How To Use
            </NavLink>
            {" · "}
            <a
              href="https://github.com/BalasBack/ScoutNScore/releases"
              className="text-[var(--color-accent)] underline"
              target="_blank"
              rel="noreferrer"
            >
              Desktop app
            </a>{" "}
            uses Ollama for stronger local coaching.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
