import { CalendarRange } from "lucide-react";
import { hitsterData } from "@/lib/game/modes/hitster";
import type { ModeUI } from "../types";
import { BigScreen } from "./BigScreen";
import { PlayerDetails } from "./PlayerDetails";
import { RoundView } from "./RoundView";
import { Rules } from "./Rules";
import { Settings } from "./Settings";

export const hitsterUI: ModeUI = {
  icon: CalendarRange,
  tagline: "Songs nach Jahr einordnen",
  Round: RoundView,
  Screen: BigScreen,
  Settings,
  Rules,
  PlayerDetails,
  summary(game) {
    const { startCards: n, placeTimeLimit } = hitsterData(game).settings;
    return [`${n} Startkarte${n === 1 ? "" : "n"}`, placeTimeLimit ? `${placeTimeLimit} s zum Einordnen` : "Ohne Zeitlimit"];
  },
  presets: [
    { id: "short", label: "Kurz", sub: "5 Karten", core: { goal: "score", targetScore: 5 }, mode: {} },
    { id: "standard", label: "Standard", sub: "10 Karten", core: { goal: "score", targetScore: 10 }, mode: {} },
    { id: "long", label: "Lang", sub: "15 Karten", core: { goal: "score", targetScore: 15 }, mode: {} },
  ],
};
