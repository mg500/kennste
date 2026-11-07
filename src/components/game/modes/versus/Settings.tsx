"use client";

import { Row, Stepper, Toggle } from "@/components/ui/primitives";
import { versusData, type VersusSettings } from "@/lib/game/modes/versus";
import type { ModeSettingsProps } from "../types";

const seconds = (v: number) => (v === 0 ? "∞" : `${v} s`);

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { answerTime, playTimeLimit, randomStart } = versusData(game).settings;
  const update = (patch: Partial<VersusSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <Row label="Zeit zum Antworten">
        <Stepper label="Zeit zum Antworten" value={answerTime} display={`${answerTime} s`} min={5} max={60} step={5} onChange={v => update({ answerTime: v })} />
      </Row>
      <Row label="Auflösen nach">
        <Stepper label="Auflösen nach" value={playTimeLimit} display={seconds(playTimeLimit)} min={0} max={300} step={15} onChange={v => update({ playTimeLimit: v })} />
      </Row>
      <div className="border-b border-surface-2 py-1 last:border-0">
        <Toggle label="Zufällige Startstelle statt Intro" checked={randomStart} onChange={v => update({ randomStart: v })} />
      </div>
    </>
  );
}
