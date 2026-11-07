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
  playerCards: true,
  Watch,
  Settings,
  Rules,
  summary(game) {
    const { guessTimeLimit, randomStart, speedBonus } = yearData(game).settings;
    return [guessTimeLimit ? `${guessTimeLimit} s zum Schätzen` : "Ohne Zeitlimit", ...(randomStart ? ["Zufällige Startstelle"] : []), ...(speedBonus ? ["Bonus für den Schnellsten"] : [])];
  },
};
