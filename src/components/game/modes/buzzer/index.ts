import { Zap } from "lucide-react";
import { HINT_FIELDS, buzzerData } from "@/lib/game/modes/buzzer";
import type { ModeUI } from "../types";
import { InGameSettings } from "./InGameSettings";
import { PlayerDetails } from "./PlayerDetails";
import { Rules } from "./Rules";
import { RoundView } from "./RoundView";
import { BigScreen } from "./BigScreen";
import { HINT_LABELS, Settings } from "./Settings";

export const buzzerUI: ModeUI = {
  icon: Zap,
  tagline: "Song erkennen, schneller buzzern",
  Round: RoundView,
  Screen: BigScreen,
  Settings,
  InGameSettings,
  Rules,
  PlayerDetails,
  summary(game) {
    const s = buzzerData(game).settings;
    const hints = HINT_FIELDS.filter(f => s.hintsEnabled[f]).map(f => HINT_LABELS[f]);
    return [
      s.buzzTimeLimit ? `${s.buzzTimeLimit} s zum Antworten` : "Unbegrenzt Zeit zum Antworten",
      hints.length ? `Tipps: ${hints.join(", ")}` : "Keine Tipps",
    ];
  },
  presets: [
    { id: "quick", label: "Schnell", sub: "3 Runden", core: { goal: "rounds", maxRounds: 3 }, mode: { playTimeLimit: 20, buzzTimeLimit: 10 } },
    { id: "standard", label: "Standard", sub: "5 Runden", core: { goal: "rounds", maxRounds: 5 }, mode: { playTimeLimit: 30, buzzTimeLimit: 10 } },
    { id: "party", label: "Party", sub: "Bis 10 Punkte", core: { goal: "score", targetScore: 10 }, mode: { playTimeLimit: 30, buzzTimeLimit: 15 } },
  ],
};
