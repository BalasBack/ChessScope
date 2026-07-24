import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  Menu,
  X,
} from "lucide-react";
import { isWebApp } from "../lib/api";
import { cn } from "../lib/utils";
import { WelcomeModal } from "./WelcomeModal";

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

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="accent-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/20">
        <Crown className="h-5 w-5 text-[var(--color-accent)]" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold tracking-wide">ScoutNScore</div>
        {!compact && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-3">
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
              isActive
                ? "bg-[var(--color-accent)]/15 font-medium text-[var(--color-accent)] shadow-sm"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]",
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--color-surface)]">
      <WelcomeModal />

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-2)] md:flex">
        <div className="border-b border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-surface-3)] px-5 py-6">
          <BrandBlock />
        </div>
        <NavLinks />
        <div className="border-t border-[var(--color-border)] p-4 text-[10px] text-[var(--color-muted)]">
          {isWebApp() ? "Web Edition" : "Desktop Edition"}
        </div>
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col bg-[var(--color-surface-2)] shadow-xl">
            <div className="flex items-start justify-between border-b border-[var(--color-border)] px-4 py-4">
              <BrandBlock />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-3)]"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMenuOpen(false)} />
            <div className="border-t border-[var(--color-border)] p-4 text-[10px] text-[var(--color-muted)]">
              {isWebApp() ? "Web Edition" : "Desktop Edition"}
            </div>
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-lg p-2 text-[var(--color-text)] hover:bg-[var(--color-surface-3)]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandBlock compact />
        </div>

        {isWebApp() && (
          <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-accent)]/8 px-3 py-2 text-center text-[11px] leading-snug text-[var(--color-muted)] sm:px-4 sm:text-xs">
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
            </a>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
