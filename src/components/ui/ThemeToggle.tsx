"use client";

import { useSyncExternalStore } from "react";
import { Palette } from "lucide-react";
import { THEMES, THEME_STORAGE_KEY, type ThemeId } from "./theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useTheme(): [ThemeId, (theme: ThemeId) => void] {
  const theme = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme as ThemeId) ?? "party",
    () => "party" as ThemeId,
  );
  const setTheme = (next: ThemeId) => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch {}
  };
  return [theme, setTheme];
}

/** Switches between the visual styles. Shows the current style's name unless `compact`. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useTheme();
  const index = THEMES.findIndex(t => t.id === theme);
  const next = THEMES[(index + 1) % THEMES.length];
  const current = THEMES[index] ?? THEMES[0];
  return (
    <button
      onClick={() => setTheme(next.id)}
      aria-label={`Stil wechseln (aktuell ${current.name})`}
      className={`flex items-center justify-center gap-2 h-11 rounded-full bg-surface text-text font-medium text-sm hover:brightness-125 transition ${compact ? "w-11" : "px-4"}`}
    >
      <Palette size={18} aria-hidden />
      {!compact && current.name}
    </button>
  );
}
