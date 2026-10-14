import { ListChecks } from "lucide-react";
import { choiceData } from "@/lib/game/modes/choice";
import type { ModeUI } from "../types";
import { BigScreen } from "./BigScreen";
import { RoundView } from "./RoundView";
import { Rules } from "./Rules";
import { Settings } from "./Settings";
import { Watch } from "./Watch";

const ASK_LABELS = { title: "Titel gesucht", artist: "Interpret gesucht", mixed: "Titel & Interpret" } as const;

export const choiceUI: ModeUI = {
  icon: ListChecks,
  tagline: "Aus vier Antworten den Song erkennen",
  Round: RoundView,
  Screen: BigScreen,
  Watch,
  Settings,
  Rules,
  summary(game) {
    const { ask, answerTimeLimit } = choiceData(game).settings;
    return [ASK_LABELS[ask], answerTimeLimit ? `${answerTimeLimit} s zum Antworten` : "Ohne Zeitlimit"];
  },
  presets: [
    { id: "short", label: "Kurz", sub: "5 Songs", core: { goal: "rounds", maxRounds: 5 }, mode: {} },
    { id: "standard", label: "Standard", sub: "10 Songs", core: { goal: "rounds", maxRounds: 10 }, mode: {} },
    { id: "long", label: "Lang", sub: "20 Songs", core: { goal: "rounds", maxRounds: 20 }, mode: {} },
  ],
};
