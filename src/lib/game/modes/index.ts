import { buzzer, type BuzzerAction, type BuzzerData } from "./buzzer";
import type { GameMode } from "./types";

/** All available game modes. Add a new mode here (and its UI in components/game/modes). */
export const MODES = { buzzer } as const;

export type ModeId = keyof typeof MODES;
/** Union of every mode's state, discriminated by `id`. */
export type ModeData = BuzzerData;
/** Union of every mode's actions. */
export type ModeAction = BuzzerAction;

export const isModeId = (v: unknown): v is ModeId => typeof v === "string" && Object.hasOwn(MODES, v);

export function getMode(id: ModeId): GameMode<ModeData, ModeAction> {
  return MODES[id];
}
