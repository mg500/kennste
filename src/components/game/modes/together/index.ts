import { UsersRound } from "lucide-react";
import { togetherData } from "@/lib/game/modes/together";
import { RANDOM_START_CHIP, SPEED_BONUS_CHIP, songTimeChip } from "../settingRows";
import type { ModeUI } from "../types";
import { BigScreen, BigTimeline } from "./BigScreen";
import { RoundView } from "./RoundView";
import { Rules } from "./Rules";
import { Settings } from "./Settings";
import { Watch } from "./Watch";

export const togetherUI: ModeUI = {
  icon: UsersRound,
  tagline: "Alle legen gleichzeitig in einen Zeitstrahl",
  Round: RoundView,
  Screen: BigScreen,
  playerCards: true,
  ScreenWide: BigTimeline,
  Watch,
  Settings,
  Rules,
  summary(game) {
    const { placeTimeLimit, randomStart, speedBonus } = togetherData(game).settings;
    return [songTimeChip(placeTimeLimit), ...(speedBonus ? [SPEED_BONUS_CHIP] : []), ...(randomStart ? [RANDOM_START_CHIP] : [])];
  },
};
