import { Swords } from "lucide-react";
import { versusData } from "@/lib/game/modes/versus";
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
    const { buzzesPerSong: n, cooldown, answerTime, playTimeLimit } = versusData(game).settings;
    return [
      `${n} Buzzer pro Song`,
      ...(n > 1 && cooldown ? [`${cooldown} s Sperre`] : []),
      `${answerTime} s zum Antworten`,
      playTimeLimit ? `Auflösen nach ${playTimeLimit} s` : "Ohne Zeitlimit",
    ];
  },
  presets: [
    { id: "short", label: "Kurz", sub: "5 Songs", core: { goal: "rounds", maxRounds: 5 }, mode: {} },
    { id: "standard", label: "Standard", sub: "10 Songs", core: { goal: "rounds", maxRounds: 10 }, mode: {} },
    { id: "party", label: "Party", sub: "Bis 10 Punkte", core: { goal: "score", targetScore: 10 }, mode: {} },
  ],
};
