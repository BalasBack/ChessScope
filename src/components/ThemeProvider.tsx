import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { applyTheme, themeFromSettings } from "../lib/theme";
import type { ThemeId } from "../lib/types";

type ThemeContextValue = {
  theme: ThemeId;
  compact: boolean;
  setTheme: (t: ThemeId) => void;
  setCompact: (c: boolean) => void;
};

const ThemeCtx = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("slate");
  const [compact, setCompactState] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      const t = themeFromSettings(s.theme);
      const c = s.compact_ui ?? false;
      setThemeState(t);
      setCompactState(c);
      applyTheme(t, c);
    });
  }, []);

  const persist = async (t: ThemeId, c: boolean) => {
    const s = await api.getSettings();
    await api.saveSettings({ ...s, theme: t, compact_ui: c });
  };

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    applyTheme(t, compact);
    persist(t, compact);
  };

  const setCompact = (c: boolean) => {
    setCompactState(c);
    applyTheme(theme, c);
    persist(theme, c);
  };

  return (
    <ThemeCtx.Provider value={{ theme, compact, setTheme, setCompact }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
