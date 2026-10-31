import type { ModeId } from "./index";

/** One way to play a group: a mode, optionally with some of its settings fixed (e.g. the timeline as a team). */
export interface ModeVariant {
  label: string;
  /** One sentence on what makes it different, for the lobby and the TV. */
  description: string;
  mode: ModeId;
  settings?: Record<string, unknown>;
}

/** What the start page and the lobby offer: few modes, each with its variants. */
export interface ModeGroup {
  id: "buzzer" | "timeline" | "year" | "choice";
  name: string;
  tagline: string;
  variants: ModeVariant[];
}

export const MODE_GROUPS: readonly ModeGroup[] = [
  {
    id: "buzzer", name: "Buzzer", tagline: "Song erkennen, schneller buzzern", variants: [
      { label: "Reihum", description: "Wer dran ist, legt einen Song auf und bewertet die anderen.", mode: "buzzer" },
      { label: "Alle gegen alle", description: "Alle hören denselben Song. Wer zuerst buzzert, antwortet laut und bewertet sich selbst, die anderen bestätigen.", mode: "versus" },
    ],
  },
  {
    id: "timeline", name: "Zeitstrahl", tagline: "Songs nach Jahr einordnen", variants: [
      { label: "Jeder für sich", description: "Reihum hört jeder einen Song und legt ihn in seinen eigenen Zeitstrahl.", mode: "timeline", settings: { coop: false } },
      { label: "Im Team", description: "Ein Zeitstrahl für alle: wer dran ist, legt, die anderen schlagen Lücken vor. Jede falsche Karte kostet ein Leben.", mode: "timeline", settings: { coop: true } },
      { label: "Alle gleichzeitig", description: "Ein Song läuft, alle legen verdeckt in denselben Zeitstrahl. Wer richtig liegt, punktet.", mode: "together" },
    ],
  },
  {
    id: "year", name: "Jahr schätzen", tagline: "Alle schätzen das Erscheinungsjahr", variants: [
      { label: "", description: "Ein Song läuft, alle stellen gleichzeitig ein Jahr ein. Volltreffer 3 Punkte, bis 2 Jahre daneben 2, bis 5 Jahre 1.", mode: "year" },
    ],
  },
  {
    id: "choice", name: "Vier Antworten", tagline: "Aus vier Antworten den Song erkennen", variants: [
      { label: "Titel", description: "Welcher Titel läuft gerade?", mode: "choice", settings: { ask: "title" } },
      { label: "Interpret", description: "Wer singt das?", mode: "choice", settings: { ask: "artist" } },
      { label: "Abwechselnd", description: "Mal wird der Titel gefragt, mal der Interpret.", mode: "choice", settings: { ask: "mixed" } },
    ],
  },
];

/** The group a mode belongs to. */
export function groupOf(mode: ModeId): ModeGroup {
  return MODE_GROUPS.find(g => g.variants.some(v => v.mode === mode))!;
}

/** The variant a game is set to: its mode, and the settings that tell the variants of that mode apart. */
export function variantOf(mode: { id: ModeId; settings?: object }): ModeVariant {
  const settings = (mode.settings ?? {}) as Record<string, unknown>;
  const candidates = groupOf(mode.id).variants.filter(v => v.mode === mode.id);
  return candidates.find(v => Object.entries(v.settings ?? {}).every(([k, val]) => settings[k] === val)) ?? candidates[0];
}

/** "Zeitstrahl · Im Team", or just "Jahr schätzen" for a group without variants. */
export function modeName(mode: { id: ModeId; settings?: object }): string {
  const group = groupOf(mode.id);
  return group.variants.length > 1 ? `${group.name} · ${variantOf(mode).label}` : group.name;
}

