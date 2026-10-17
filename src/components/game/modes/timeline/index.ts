import { CalendarRange } from "lucide-react";
import { timelineData } from "@/lib/game/modes/timeline";
import type { ModeUI } from "../types";
import { BigScreen, BigTimeline } from "./BigScreen";
import { TeamSummary } from "./coop";
import { PlayerDetails } from "./PlayerDetails";
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
  PlayerDetails,
  TeamSummary,
  summary(game) {
    const { startCards: n, placeTimeLimit, coop, lives, randomStart } = timelineData(game).settings;
    return [
      ...(coop ? [`Gemeinsam · ${lives} Leben`] : []),
      `${n} Startkarte${n === 1 ? "" : "n"}`,
      placeTimeLimit ? `${placeTimeLimit} s zum Einordnen` : "Ohne Zeitlimit",
      ...(randomStart ? ["Zufällige Startstelle"] : []),
    ];
  },
  presets: [
    { id: "short", label: "Kurz", sub: "5 Karten", core: { goal: "score", targetScore: 5 }, mode: {} },
    { id: "standard", label: "Standard", sub: "10 Karten", core: { goal: "score", targetScore: 10 }, mode: {} },
    { id: "long", label: "Lang", sub: "15 Karten", core: { goal: "score", targetScore: 15 }, mode: {} },
  ],
};
