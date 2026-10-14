"use client";

import { Toggle } from "@/components/ui/primitives";
import type { ModeSettingsProps } from "../types";

/** Settings the host can still change while a buzzer game is running. */
export function InGameSettings({ game, controls: { act } }: ModeSettingsProps) {
  return (
    <Toggle label="Musik pausieren, wenn jemand buzzert" checked={game.mode.settings.autoPauseOnBuzz}
      onChange={checked => act({ type: "updateModeSettings", patch: { autoPauseOnBuzz: checked } })} />
  );
}
