import { History } from "lucide-react";
import { yearData } from "@/lib/game/modes/year";
import { RANDOM_START_CHIP, SPEED_BONUS_CHIP, songTimeChip } from "../settingRows";
import type { ModeUI } from "../types";
import { BigScreen } from "./BigScreen";
import { RoundView } from "./RoundView";
import { Rules } from "./Rules";
import { Settings } from "./Settings";
import { Watch } from "./Watch";

export const yearUI: ModeUI = {
  icon: History,
  tagline: "Alle schätzen das Erscheinungsjahr",
  Round: RoundView,
  Screen: BigScreen,
  playerCards: true,
  Watch,
  Settings,
  Rules,
  summary(game) {
    const { guessTimeLimit, randomStart, speedBonus } = yearData(game).settings;
    return [songTimeChip(guessTimeLimit), ...(speedBonus ? [SPEED_BONUS_CHIP] : []), ...(randomStart ? [RANDOM_START_CHIP] : [])];
  },
};
