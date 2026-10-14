import type { ModeId } from "@/lib/game/modes";
import { buzzerUI } from "./buzzer";
import { hitsterUI } from "./hitster";
import type { ModeUI } from "./types";
import { yearUI } from "./year";

const MODE_UI: Record<ModeId, ModeUI> = { buzzer: buzzerUI, hitster: hitsterUI, year: yearUI };

/** Modes that are announced in the UI but not playable yet. */
export const UPCOMING_MODES: string[] = [];

export function getModeUI(id: ModeId): ModeUI {
  return MODE_UI[id];
}
