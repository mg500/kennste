"use client";

import { buzzerData } from "@/lib/game/modes/buzzer";
import { Toggle } from "@/components/ui/primitives";
import type { ModeSettingsProps } from "../types";

/** Settings the host can still change while a buzzer game is running. */
export function InGameSettings({ game, controls: { act } }: Omit<ModeSettingsProps, "part">) {
  return (
    <Toggle label="Musik pausieren, wenn jemand buzzert" checked={buzzerData(game).settings.autoPauseOnBuzz}
      onChange={checked => act({ type: "updateModeSettings", patch: { autoPauseOnBuzz: checked } })} />
  );
}
