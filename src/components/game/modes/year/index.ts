import { History } from "lucide-react";
import { yearData } from "@/lib/game/modes/year";
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
  Watch,
  Settings,
  Rules,
  summary(game) {
    const { guessTimeLimit, randomStart } = yearData(game).settings;
    return [guessTimeLimit ? `${guessTimeLimit} s zum Schätzen` : "Ohne Zeitlimit", ...(randomStart ? ["Zufällige Startstelle"] : [])];
  },
  presets: [
    { id: "short", label: "Kurz", sub: "5 Songs", core: { goal: "rounds", maxRounds: 5 }, mode: {} },
    { id: "standard", label: "Standard", sub: "10 Songs", core: { goal: "rounds", maxRounds: 10 }, mode: {} },
    { id: "long", label: "Lang", sub: "20 Songs", core: { goal: "rounds", maxRounds: 20 }, mode: {} },
  ],
};
