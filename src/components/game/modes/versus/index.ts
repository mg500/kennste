import { Swords } from "lucide-react";
import { versusData } from "@/lib/game/modes/versus";
import { RANDOM_START_CHIP, buzzTimeChip, songTimeChip } from "../settingRows";
import type { ModeUI } from "../types";
import { BigScreen } from "./BigScreen";
import { RoundView } from "./RoundView";
import { Rules } from "./Rules";
import { Settings } from "./Settings";
import { Watch } from "./Watch";

export const versusUI: ModeUI = {
  icon: Swords,
  tagline: "Alle hören denselben Song – wer buzzert zuerst?",
  Round: RoundView,
  Screen: BigScreen,
  playerCards: true,
  Watch,
  Settings,
  Rules,
  summary(game) {
    const { answerTime, playTimeLimit, randomStart } = versusData(game).settings;
    return [songTimeChip(playTimeLimit), buzzTimeChip(answerTime), "1 Buzzer pro Song", ...(randomStart ? [RANDOM_START_CHIP] : [])];
  },
};
