import type { ModeId } from "@/lib/game/modes";
import type { ModeGroup } from "@/lib/game/modes/groups";
import { buzzerUI } from "./buzzer";
import { choiceUI } from "./choice";
import { timelineUI } from "./timeline";
import { togetherUI } from "./together";
import type { ModeUI } from "./types";
import { versusUI } from "./versus";
import { yearUI } from "./year";

const MODE_UI: Record<ModeId, ModeUI> = { buzzer: buzzerUI, versus: versusUI, timeline: timelineUI, together: togetherUI, year: yearUI, choice: choiceUI };

/**
 * Each game's color – the same on the start page, in the lobby and on the TV, so it's recognized everywhere.
 * Full class names, so Tailwind finds them; `text` is for text on the normal background.
 */
export const GROUP_COLORS: Record<ModeGroup["id"], { bg: string; border: string; lgBorder: string; text: string }> = {
  buzzer: { bg: "bg-buzz", border: "border-buzz", lgBorder: "lg:border-buzz", text: "text-buzz-text" },
  timeline: { bg: "bg-positive", border: "border-positive", lgBorder: "lg:border-positive", text: "text-positive-text" },
  year: { bg: "bg-info", border: "border-info", lgBorder: "lg:border-info", text: "text-text" },
  choice: { bg: "bg-primary", border: "border-primary", lgBorder: "lg:border-primary", text: "text-primary-text" },
};

/** Modes that are announced in the UI but not playable yet. */
export const UPCOMING_MODES: string[] = [];

export function getModeUI(id: ModeId): ModeUI {
  return MODE_UI[id];
}
