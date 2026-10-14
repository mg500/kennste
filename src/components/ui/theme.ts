export const THEMES = [
  { id: "party", name: "Party" },
  { id: "minimal", name: "Minimal" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "theme";

/** Runs before first paint (inline in <head>) so a saved theme never flashes the default. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="party"||t==="minimal")document.documentElement.dataset.theme=t}catch(e){}`;
