"use client";

import { Row, Stepper, Toggle } from "@/components/ui/primitives";

/*
 * The setting rows every mode shares, so they are called the same, offer the same steps and come in the same order:
 * length (core), time per song, time after buzzing, the mode's own rules, random start, turn order (core).
 */

/** Steps for the time limits: fine at first, coarser later, so long limits don't take many taps. 0 = no limit. */
export const SONG_TIMES = [0, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180, 300];
export const BUZZ_TIMES = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];

const seconds = (v: number) => (v === 0 ? "∞" : `${v} s`);

/** Position of `value` in `steps`, or of the closest step for a value set before the steps existed. */
function stepIndex(steps: number[], value: number) {
  return steps.reduce((best, s, i) => (Math.abs(s - value) < Math.abs(steps[best] - value) ? i : best), 0);
}

function TimeRow({ label, steps, value, onChange }: { label: string; steps: number[]; value: number; onChange: (v: number) => void }) {
  return (
    <Row label={label}>
      <Stepper label={label} value={stepIndex(steps, value)} display={seconds(value)} min={0} max={steps.length - 1}
        onChange={i => onChange(steps[i])} />
    </Row>
  );
}

/** How long a song plays before it is revealed on its own. */
export function SongTimeRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <TimeRow label="Zeit pro Song" steps={SONG_TIMES} value={value} onChange={onChange} />;
}

/** How long whoever buzzed has to answer. */
export function BuzzTimeRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <TimeRow label="Zeit nach dem Buzzern" steps={BUZZ_TIMES} value={value} onChange={onChange} />;
}

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="border-b border-surface-2 py-1 last:border-0">
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

export function SpeedBonusRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <ToggleRow label="Bonuspunkt für den Schnellsten" checked={checked} onChange={onChange} />;
}

export function RandomStartRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <ToggleRow label="Zufällige Startstelle statt Intro" checked={checked} onChange={onChange} />;
}

/** The same rules as chips for the mode card, in the same words and order as the rows. */
export const songTimeChip = (v: number) => (v ? `${v} s pro Song` : "Ohne Zeitlimit");
export const buzzTimeChip = (v: number) => (v ? `${v} s nach dem Buzzern` : "Antworten ohne Zeitlimit");
export const SPEED_BONUS_CHIP = "Bonus für den Schnellsten";
export const RANDOM_START_CHIP = "Zufällige Startstelle";
