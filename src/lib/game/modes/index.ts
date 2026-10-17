import { buzzer, type BuzzerAction, type BuzzerData } from "./buzzer";
import { choice, type ChoiceAction, type ChoiceData } from "./choice";
import { timeline, type TimelineAction, type TimelineData } from "./timeline";
import { together, type TogetherAction, type TogetherData } from "./together";
import type { GameMode } from "./types";
import { year, type YearAction, type YearData } from "./year";

/** All available game modes. Add a new mode here (and its UI in components/game/modes). */
export const MODES = { buzzer, timeline, together, year, choice } as const;

export type ModeId = keyof typeof MODES;
/** Union of every mode's state, discriminated by `id`. */
export type ModeData = BuzzerData | TimelineData | TogetherData | YearData | ChoiceData;
/** Union of every mode's actions. */
export type ModeAction = BuzzerAction | TimelineAction | TogetherAction | YearAction | ChoiceAction;

export const isModeId = (v: unknown): v is ModeId => typeof v === "string" && Object.hasOwn(MODES, v);

export function getMode(id: ModeId): GameMode<ModeData, ModeAction> {
  return MODES[id] as GameMode<ModeData, ModeAction>;
}
