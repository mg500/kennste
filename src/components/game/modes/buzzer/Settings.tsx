"use client";

import { Row, Stepper, Toggle } from "@/components/ui/primitives";
import { HINT_FIELDS, type BuzzerSettings, buzzerData } from "@/lib/game/modes/buzzer";
import type { ModeSettingsProps } from "../types";

export const HINT_LABELS = { cover: "Cover", title: "Titel", artist: "Interpret", year: "Jahr" } as const;

const seconds = (v: number) => (v === 0 ? "∞" : `${v} s`);

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { hintsEnabled, playTimeLimit, buzzTimeLimit, randomStart } = buzzerData(game).settings;
  const update = (patch: Partial<BuzzerSettings>) => act({ type: "updateModeSettings", patch });

  return (
    <>
      <Row label="Zeit zum Antworten">
        <Stepper label="Zeit zum Antworten" value={buzzTimeLimit} display={seconds(buzzTimeLimit)} min={0} max={120} step={5}
          onChange={v => update({ buzzTimeLimit: v })} />
      </Row>
      <Row label="Auflösen nach">
        <Stepper label="Auflösen nach" value={playTimeLimit} display={seconds(playTimeLimit)} min={0} max={300} step={5}
          onChange={v => update({ playTimeLimit: v })} />
      </Row>
      <div className="border-b border-surface-2 py-1 last:border-0">
        <Toggle label="Zufällige Startstelle statt Intro" checked={randomStart} onChange={v => update({ randomStart: v })} />
      </div>
      <div className="flex flex-col gap-2 border-b border-surface-2 py-3 last:border-0">
        <span>Erlaubte Tipps</span>
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
    </>
  );
}
