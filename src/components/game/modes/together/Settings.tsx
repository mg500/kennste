"use client";

import { Row, Stepper, Toggle } from "@/components/ui/primitives";
import { togetherData, type TogetherSettings } from "@/lib/game/modes/together";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { placeTimeLimit, randomStart, speedBonus } = togetherData(game).settings;
  const update = (patch: Partial<TogetherSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <Row label="Zeit zum Legen">
        <Stepper label="Zeit zum Legen" value={placeTimeLimit} display={placeTimeLimit === 0 ? "∞" : `${placeTimeLimit} s`}
          min={0} max={120} step={15} onChange={v => update({ placeTimeLimit: v })} />
      </Row>
      <div className="border-b border-surface-2 py-1 last:border-0">
        <Toggle label="Bonuspunkt für den Schnellsten" checked={speedBonus} onChange={v => update({ speedBonus: v })} />
      </div>
    <div className="border-b border-surface-2 py-1 last:border-0">
      <Toggle label="Zufällige Startstelle statt Intro" checked={randomStart} onChange={v => update({ randomStart: v })} />
    </div>
    </>
  );
}
