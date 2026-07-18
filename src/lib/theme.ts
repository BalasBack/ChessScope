import type { ThemeId } from "./types";

export const THEME_OPTIONS: { id: ThemeId; label: string; description: string }[] = [
  { id: "slate", label: "Slate", description: "Default cool dark" },
  { id: "midnight", label: "Midnight", description: "Deep blue-black" },
  { id: "forest", label: "Forest", description: "Muted green tones" },
  { id: "royal", label: "Royal", description: "Purple accent" },
  { id: "light", label: "Light", description: "Bright daytime" },
];

export function applyTheme(theme: ThemeId, compact?: boolean) {
  document.documentElement.dataset.theme = theme;
  if (compact) document.documentElement.dataset.compact = "true";
  else delete document.documentElement.dataset.compact;
}

export function themeFromSettings(
  theme: string | null | undefined,
): ThemeId {
  if (theme && THEME_OPTIONS.some((t) => t.id === theme)) {
    return theme as ThemeId;
  }
  return "slate";
}
