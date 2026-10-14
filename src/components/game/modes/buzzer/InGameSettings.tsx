"use client";

import type { ModeSettingsProps } from "../types";

/** Settings the host can still change while a buzzer game is running. */
export function InGameSettings({ game, controls: { act } }: ModeSettingsProps) {
  const on = game.mode.settings.autoPauseOnBuzz;
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-gray-300">Pausieren wenn gebuzzert</span>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => act({ type: "updateModeSettings", patch: { autoPauseOnBuzz: !on } })}
        className={`relative w-10 h-5 rounded-full transition-colors ${on ? "bg-green-500" : "bg-gray-700"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`} />
      </button>
    </label>
  );
}
