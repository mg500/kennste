"use client";

import { yearData, type YearSettings } from "@/lib/game/modes/year";
import { RandomStartRow, SongTimeRow, SpeedBonusRow } from "../settingRows";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { guessTimeLimit, randomStart, speedBonus } = yearData(game).settings;
  const update = (patch: Partial<YearSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <SongTimeRow value={guessTimeLimit} onChange={v => update({ guessTimeLimit: v })} />
      <SpeedBonusRow checked={speedBonus} onChange={v => update({ speedBonus: v })} />
      <RandomStartRow checked={randomStart} onChange={v => update({ randomStart: v })} />
    </>
  );
}
