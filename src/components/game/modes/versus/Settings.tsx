"use client";

import { versusData, type VersusSettings } from "@/lib/game/modes/versus";
import { BuzzTimeRow, RandomStartRow, SongTimeRow } from "../settingRows";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { answerTime, playTimeLimit, randomStart } = versusData(game).settings;
  const update = (patch: Partial<VersusSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <SongTimeRow value={playTimeLimit} onChange={v => update({ playTimeLimit: v })} />
      <BuzzTimeRow value={answerTime} onChange={v => update({ answerTime: v })} />
      <RandomStartRow checked={randomStart} onChange={v => update({ randomStart: v })} />
    </>
  );
}
