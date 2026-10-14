"use client";

import { Row, Segmented, Stepper } from "@/components/ui/primitives";
import { choiceData, type ChoiceSettings } from "@/lib/game/modes/choice";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { ask, answerTimeLimit } = choiceData(game).settings;
  const update = (patch: Partial<ChoiceSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <Row label="Gefragt wird">
        <Segmented value={ask} onChange={v => update({ ask: v })}
          options={[{ value: "title", label: "Titel" }, { value: "artist", label: "Interpret" }, { value: "mixed", label: "Beides" }]} />
      </Row>
      <Row label="Zeit zum Antworten">
        <Stepper label="Zeit zum Antworten" value={answerTimeLimit} display={answerTimeLimit === 0 ? "∞" : `${answerTimeLimit} s`}
          min={0} max={60} step={5} onChange={v => update({ answerTimeLimit: v })} />
      </Row>
    </>
  );
}
