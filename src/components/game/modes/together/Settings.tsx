"use client";

import { togetherData, type TogetherSettings } from "@/lib/game/modes/together";
import { RandomStartRow, SongTimeRow, SpeedBonusRow } from "../settingRows";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { placeTimeLimit, randomStart, speedBonus } = togetherData(game).settings;
  const update = (patch: Partial<TogetherSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <SongTimeRow value={placeTimeLimit} onChange={v => update({ placeTimeLimit: v })} />
      <SpeedBonusRow checked={speedBonus} onChange={v => update({ speedBonus: v })} />
      <RandomStartRow checked={randomStart} onChange={v => update({ randomStart: v })} />
    </>
  );
}
