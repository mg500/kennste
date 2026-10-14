"use client";

import { HINT_FIELDS, type BuzzerSettings } from "@/lib/game/modes/buzzer";
import { SettingRow, Stepper } from "../../parts";
import type { ModeSettingsProps } from "../types";

const HINT_LABELS = { cover: "Cover", title: "Titel", artist: "Interpret", year: "Jahr" } as const;

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { hintsEnabled, maxBuzzesPerRound: maxBuzzes, playTimeLimit, buzzTimeLimit } = game.mode.settings;
  const update = (patch: Partial<BuzzerSettings>) => act({ type: "updateModeSettings", patch });

  return (
    <>
      <SettingRow label="Tipps">
        <div className="flex gap-1.5">
          {HINT_FIELDS.map(field => {
            const on = hintsEnabled[field];
            return (
              <button key={field}
                onClick={() => update({ hintsEnabled: { ...hintsEnabled, [field]: !on } })}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${on ? "border-gray-600 text-gray-300" : "border-gray-800 text-gray-700 line-through"}`}>
                {HINT_LABELS[field]}
              </button>
            );
          })}
        </div>
      </SettingRow>
      <SettingRow label="Buzzer / Runde">
        <Stepper value={maxBuzzes}
          onDec={() => update({ maxBuzzesPerRound: Math.max(1, maxBuzzes - 1) })}
          onInc={() => update({ maxBuzzesPerRound: Math.min(5, maxBuzzes + 1) })}
          disableDec={maxBuzzes <= 1} disableInc={maxBuzzes >= 5} />
      </SettingRow>
      <SettingRow label="Zeitlimit Auflösen">
        <Stepper value={playTimeLimit}
          display={playTimeLimit === 0 ? "∞" : `${playTimeLimit}s`}
          onDec={() => update({ playTimeLimit: Math.max(0, playTimeLimit - 5) })}
          onInc={() => update({ playTimeLimit: Math.min(300, playTimeLimit + 5) })}
          disableDec={playTimeLimit <= 0} disableInc={playTimeLimit >= 300} />
      </SettingRow>
      <SettingRow label="Zeitlimit Antworten">
        <Stepper value={buzzTimeLimit}
          display={buzzTimeLimit === 0 ? "∞" : `${buzzTimeLimit}s`}
          onDec={() => update({ buzzTimeLimit: Math.max(0, buzzTimeLimit - 5) })}
          onInc={() => update({ buzzTimeLimit: Math.min(120, buzzTimeLimit + 5) })}
          disableDec={buzzTimeLimit <= 0} disableInc={buzzTimeLimit >= 120} />
      </SettingRow>
    </>
  );
}
