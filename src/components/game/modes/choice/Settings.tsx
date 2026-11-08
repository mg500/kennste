"use client";

import { choiceData, type ChoiceSettings } from "@/lib/game/modes/choice";
import { RandomStartRow, SongTimeRow, SpeedBonusRow } from "../settingRows";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { answerTimeLimit, randomStart, speedBonus } = choiceData(game).settings;
  const update = (patch: Partial<ChoiceSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <SongTimeRow value={answerTimeLimit} onChange={v => update({ answerTimeLimit: v })} />
      <SpeedBonusRow checked={speedBonus} onChange={v => update({ speedBonus: v })} />
      <RandomStartRow checked={randomStart} onChange={v => update({ randomStart: v })} />
    </>
  );
}
