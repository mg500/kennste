import { CalendarRange } from "lucide-react";
import { timelineData } from "@/lib/game/modes/timeline";
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
    return [
      ...(coop ? [`${lives} Leben`] : []),
      placeTimeLimit ? `${placeTimeLimit} s zum Einordnen` : "Ohne Zeitlimit",
      ...(randomStart ? ["Zufällige Startstelle"] : []),
    ];
  },
};
