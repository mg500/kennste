import { UsersRound } from "lucide-react";
import { togetherData } from "@/lib/game/modes/together";
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
    return [
      placeTimeLimit ? `${placeTimeLimit} s zum Legen` : "Ohne Zeitlimit",
      ...(randomStart ? ["Zufällige Startstelle"] : []),
      ...(speedBonus ? ["Bonus für den Schnellsten"] : []),
    ];
  },
  presets: [
    { id: "short", label: "Kurz", sub: "5 Songs", core: { goal: "rounds", maxRounds: 5 }, mode: {} },
    { id: "standard", label: "Standard", sub: "10 Songs", core: { goal: "rounds", maxRounds: 10 }, mode: {} },
    { id: "long", label: "Lang", sub: "20 Songs", core: { goal: "rounds", maxRounds: 20 }, mode: {} },
  ],
};
