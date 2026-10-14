"use client";

import { Row, Stepper } from "@/components/ui/primitives";
import { yearData, type YearSettings } from "@/lib/game/modes/year";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { guessTimeLimit } = yearData(game).settings;
  const update = (patch: Partial<YearSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <Row label="Zeit zum Schätzen">
      <Stepper label="Zeit zum Schätzen" value={guessTimeLimit} display={guessTimeLimit === 0 ? "∞" : `${guessTimeLimit} s`}
        min={0} max={120} step={15} onChange={v => update({ guessTimeLimit: v })} />
    </Row>
  );
}
