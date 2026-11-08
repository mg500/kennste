import { CalendarRange } from "lucide-react";
import { timelineData } from "@/lib/game/modes/timeline";
import { RANDOM_START_CHIP, songTimeChip } from "../settingRows";
import type { ModeUI } from "../types";
import { BigScreen, BigTimeline } from "./BigScreen";
import { TeamSummary } from "./coop";
import { RoundView } from "./RoundView";
import { Rules } from "./Rules";
import { Settings } from "./Settings";
import { Watch } from "./Watch";

export const timelineUI: ModeUI = {
  icon: CalendarRange,
  tagline: "Songs nach Jahr einordnen",
  Round: RoundView,
  Screen: BigScreen,
  ScreenWide: BigTimeline,
  Watch,
  Settings,
  Rules,
  TeamSummary,
  summary(game) {
    const { placeTimeLimit, coop, lives, randomStart } = timelineData(game).settings;
    return [songTimeChip(placeTimeLimit), ...(coop ? [`${lives} Leben`] : []), ...(randomStart ? [RANDOM_START_CHIP] : [])];
  },
};
