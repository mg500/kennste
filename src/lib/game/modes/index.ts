import { buzzer, type BuzzerAction, type BuzzerData } from "./buzzer";
import { hitster, type HitsterAction, type HitsterData } from "./hitster";
import type { GameMode } from "./types";

/** All available game modes. Add a new mode here (and its UI in components/game/modes). */
export const MODES = { buzzer, hitster } as const;

export type ModeId = keyof typeof MODES;
/** Union of every mode's state, discriminated by `id`. */
export type ModeData = BuzzerData | HitsterData;
/** Union of every mode's actions. */
export type ModeAction = BuzzerAction | HitsterAction;

export const isModeId = (v: unknown): v is ModeId => typeof v === "string" && Object.hasOwn(MODES, v);

export function getMode(id: ModeId): GameMode<ModeData, ModeAction> {
  return MODES[id] as GameMode<ModeData, ModeAction>;
}
