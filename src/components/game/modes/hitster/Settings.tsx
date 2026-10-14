"use client";

import { Row, Stepper } from "@/components/ui/primitives";
import { hitsterData, type HitsterSettings } from "@/lib/game/modes/hitster";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { startCards, placeTimeLimit } = hitsterData(game).settings;
  const update = (patch: Partial<HitsterSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <Row label="Startkarten pro Spieler">
        <Stepper label="Startkarten" value={startCards} min={1} max={3} onChange={v => update({ startCards: v })} />
      </Row>
      <Row label="Zeit zum Einordnen">
        <Stepper label="Zeit zum Einordnen" value={placeTimeLimit} display={placeTimeLimit === 0 ? "∞" : `${placeTimeLimit} s`}
          min={0} max={180} step={15} onChange={v => update({ placeTimeLimit: v })} />
      </Row>
    </>
  );
}
