"use client";

import { Row, Stepper, Toggle } from "@/components/ui/primitives";
import { choiceData, type ChoiceSettings } from "@/lib/game/modes/choice";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act }, part }: ModeSettingsProps) {
  const { answerTimeLimit, randomStart, speedBonus } = choiceData(game).settings;
  const update = (patch: Partial<ChoiceSettings>) => act({ type: "updateModeSettings", patch });
  if (part === "more") {
    return (
      <div className="border-b border-surface-2 py-1 last:border-0">
        <Toggle label="Zufällige Startstelle statt Intro" checked={randomStart} onChange={v => update({ randomStart: v })} />
      </div>
    );
  }
  return (
    <>
      <Row label="Zeit zum Antworten">
        <Stepper label="Zeit zum Antworten" value={answerTimeLimit} display={answerTimeLimit === 0 ? "∞" : `${answerTimeLimit} s`}
          min={0} max={60} step={5} onChange={v => update({ answerTimeLimit: v })} />
      </Row>
      <div className="border-b border-surface-2 py-1 last:border-0">
        <Toggle label="Bonuspunkt für den Schnellsten" checked={speedBonus} onChange={v => update({ speedBonus: v })} />
      </div>
    </>
  );
}
