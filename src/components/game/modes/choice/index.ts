import { ListChecks } from "lucide-react";
import { choiceData } from "@/lib/game/modes/choice";
import { RANDOM_START_CHIP, SPEED_BONUS_CHIP, songTimeChip } from "../settingRows";
import type { ModeUI } from "../types";
import { BigScreen } from "./BigScreen";
import { RoundView } from "./RoundView";
import { Rules } from "./Rules";
import { Settings } from "./Settings";
import { Watch } from "./Watch";

export const choiceUI: ModeUI = {
  icon: ListChecks,
  tagline: "Aus vier Antworten den Song erkennen",
  Round: RoundView,
  Screen: BigScreen,
  playerCards: true,
  Watch,
  Settings,
  Rules,
  summary(game) {
    const { answerTimeLimit, randomStart, speedBonus } = choiceData(game).settings;
    return [songTimeChip(answerTimeLimit), ...(speedBonus ? [SPEED_BONUS_CHIP] : []), ...(randomStart ? [RANDOM_START_CHIP] : [])];
  },
};
