"use client";

import { Row, Stepper } from "@/components/ui/primitives";
import { hitsterData } from "@/lib/game/modes/hitster";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { startCards } = hitsterData(game).settings;
  return (
    <Row label="Startkarten pro Spieler">
      <Stepper label="Startkarten" value={startCards} min={1} max={3}
        onChange={v => act({ type: "updateModeSettings", patch: { startCards: v } })} />
    </Row>
  );
}
