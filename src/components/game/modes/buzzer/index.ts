import type { ModeUI } from "../types";
import { InGameSettings } from "./InGameSettings";
import { Rules } from "./Rules";
import { RoundView } from "./RoundView";
import { Settings } from "./Settings";

export const buzzerUI: ModeUI = {
  Round: RoundView,
  Settings,
  InGameSettings,
  Rules,
  playerSongs: game => game.mode.guessedSongs,
};
