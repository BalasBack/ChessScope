import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  Dumbbell,
  Search,
  Settings,
  Crown,
} from "lucide-react";
import { isWebApp } from "../lib/api";
import { cn } from "../lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analysis", label: "Analysis", icon: BarChart3 },
  { to: "/coach", label: "AI Coach", icon: MessageSquare },
  { to: "/training", label: "Training", icon: Dumbbell },
  { to: "/scout", label: "Opponent Scout", icon: Search },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-5">
          <Crown className="h-6 w-6 text-[var(--color-accent)]" />
          <div>
            <div className="text-sm font-bold tracking-wide">ChessScope</div>
            <div className="text-xs text-[var(--color-muted)]">
              Tournament Prep
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">
        {isWebApp() && (
          <div className="border-b border-[var(--color-border)] bg-[var(--color-accent)]/10 px-4 py-2 text-center text-xs text-[var(--color-muted)]">
            Web mode — games stay in your browser. AI Coach needs the{" "}
            <a
              href="https://github.com/BalasBack/ChessScope/releases"
              className="text-[var(--color-accent)] underline"
              target="_blank"
              rel="noreferrer"
            >
              desktop app
            </a>
            .
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
