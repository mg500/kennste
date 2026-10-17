"use client";

import { Row, Stepper, Toggle } from "@/components/ui/primitives";
import { versusData, type VersusSettings } from "@/lib/game/modes/versus";
import type { ModeSettingsProps } from "../types";

const seconds = (v: number) => (v === 0 ? "∞" : `${v} s`);

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { answerTime, buzzesPerSong, cooldown, playTimeLimit, autoPauseOnBuzz, randomStart } = versusData(game).settings;
  const update = (patch: Partial<VersusSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <Row label="Buzzer pro Song">
        <Stepper label="Buzzer pro Song" value={buzzesPerSong} min={1} max={5} onChange={v => update({ buzzesPerSong: v })} />
      </Row>
      <Row label="Sperre nach Fehlbuzz">
        <Stepper label="Sperre nach Fehlbuzz" value={cooldown} display={`${cooldown} s`} min={0} max={30} step={5} onChange={v => update({ cooldown: v })} />
      </Row>
      <Row label="Zeit zum Antworten">
        <Stepper label="Zeit zum Antworten" value={answerTime} display={`${answerTime} s`} min={5} max={60} step={5} onChange={v => update({ answerTime: v })} />
      </Row>
      <Row label="Auflösen nach">
        <Stepper label="Auflösen nach" value={playTimeLimit} display={seconds(playTimeLimit)} min={0} max={300} step={15} onChange={v => update({ playTimeLimit: v })} />
      </Row>
      <div className="border-b border-surface-2 py-1 last:border-0">
        <Toggle label="Musik pausiert beim Buzzern" checked={autoPauseOnBuzz} onChange={v => update({ autoPauseOnBuzz: v })} />
      </div>
      <div className="border-b border-surface-2 py-1 last:border-0">
        <Toggle label="Zufällige Startstelle statt Intro" checked={randomStart} onChange={v => update({ randomStart: v })} />
      </div>
    </>
  );
}
