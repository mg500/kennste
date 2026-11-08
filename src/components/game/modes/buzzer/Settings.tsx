"use client";

import { HINT_FIELDS, type BuzzerSettings, buzzerData } from "@/lib/game/modes/buzzer";
import { BuzzTimeRow, RandomStartRow, SongTimeRow } from "../settingRows";
import type { ModeSettingsProps } from "../types";

export const HINT_LABELS = { cover: "Cover", title: "Titel", artist: "Interpret", year: "Jahr" } as const;

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { hintsEnabled, playTimeLimit, buzzTimeLimit, randomStart } = buzzerData(game).settings;
  const update = (patch: Partial<BuzzerSettings>) => act({ type: "updateModeSettings", patch });

  return (
    <>
      <SongTimeRow value={playTimeLimit} onChange={v => update({ playTimeLimit: v })} />
      <BuzzTimeRow value={buzzTimeLimit} onChange={v => update({ buzzTimeLimit: v })} />
      <div role="group" aria-labelledby="hints-label" className="flex flex-col gap-2 border-b border-surface-2 py-3 last:border-0">
        <span id="hints-label">Erlaubte Tipps</span>
        <div className="flex flex-wrap gap-2">
          {HINT_FIELDS.map(field => {
            const on = hintsEnabled[field];
            return (
              <button key={field} aria-pressed={on} onClick={() => update({ hintsEnabled: { ...hintsEnabled, [field]: !on } })}
                className={`h-10 rounded-full border-2 px-4 text-sm font-bold transition ${on ? "border-primary bg-primary text-on-accent" : "border-surface-2 text-muted"}`}>
                {HINT_LABELS[field]}
              </button>
            );
          })}
        </div>
      </div>
      <RandomStartRow checked={randomStart} onChange={v => update({ randomStart: v })} />
    </>
  );
}
