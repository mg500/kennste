import type { ModeId } from "@/lib/game/modes";
import { buzzerUI } from "./buzzer";
import { choiceUI } from "./choice";
import { timelineUI } from "./timeline";
import { togetherUI } from "./together";
import type { ModeUI } from "./types";
import { yearUI } from "./year";

const MODE_UI: Record<ModeId, ModeUI> = { buzzer: buzzerUI, timeline: timelineUI, together: togetherUI, year: yearUI, choice: choiceUI };

/** Modes that are announced in the UI but not playable yet. */
export const UPCOMING_MODES: string[] = [];

export function getModeUI(id: ModeId): ModeUI {
  return MODE_UI[id];
}
