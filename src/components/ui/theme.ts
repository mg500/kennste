export const THEMES = [
  { id: "minimal", name: "Minimal", themeColor: "#0b0b0f" },
  { id: "light", name: "Hell", themeColor: "#f2f2f4" },
  { id: "stage", name: "Bühne", themeColor: "#141013" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "theme";

/** Sets the theme on <html> and colors the browser bar to match. */
export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  const color = THEMES.find(t => t.id === id)?.themeColor;
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

const colors = Object.fromEntries(THEMES.map(t => [t.id, t.themeColor]));

/**
 * Runs before first paint (inline in <head>) so a saved theme never flashes the default.
 * The theme-color meta tag may come after this script, hence the second try on DOMContentLoaded.
 */
export const THEME_INIT_SCRIPT = `try{var c=${JSON.stringify(colors)},t=localStorage.getItem("${THEME_STORAGE_KEY}");if(c[t]){document.documentElement.dataset.theme=t;var m=function(){var e=document.querySelector('meta[name="theme-color"]');if(e)e.setAttribute("content",c[t])};m();document.addEventListener("DOMContentLoaded",m)}}catch(e){}`;
