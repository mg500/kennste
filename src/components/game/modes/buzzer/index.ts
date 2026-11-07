import { Zap } from "lucide-react";
import { HINT_FIELDS, buzzerData } from "@/lib/game/modes/buzzer";
import type { ModeUI } from "../types";
import { InGameSettings } from "./InGameSettings";
import { Rules } from "./Rules";
import { RoundView } from "./RoundView";
import { BigScreen } from "./BigScreen";
import { Watch } from "./Watch";
import { HINT_LABELS, Settings } from "./Settings";

export const buzzerUI: ModeUI = {
  icon: Zap,
  tagline: "Song erkennen, schneller buzzern",
  Round: RoundView,
  Screen: BigScreen,
  Watch,
  Settings,
  InGameSettings,
  Rules,
  summary(game) {
    const s = buzzerData(game).settings;
    const hints = HINT_FIELDS.filter(f => s.hintsEnabled[f]).map(f => HINT_LABELS[f]);
    return [
      s.buzzTimeLimit ? `${s.buzzTimeLimit} s zum Antworten` : "Unbegrenzt Zeit zum Antworten",
      hints.length ? `Tipps: ${hints.join(", ")}` : "Keine Tipps",
      ...(s.randomStart ? ["Zufällige Startstelle"] : []),
    ];
  },
};
