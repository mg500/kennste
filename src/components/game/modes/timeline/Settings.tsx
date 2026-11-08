"use client";

import { Row, Stepper } from "@/components/ui/primitives";
import { timelineData, type TimelineSettings } from "@/lib/game/modes/timeline";
import { RandomStartRow, SongTimeRow } from "../settingRows";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { placeTimeLimit, coop, lives, randomStart } = timelineData(game).settings;
  const update = (patch: Partial<TimelineSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <SongTimeRow value={placeTimeLimit} onChange={v => update({ placeTimeLimit: v })} />
      {coop && (
        <Row label="Leben">
          <Stepper label="Leben" value={lives} min={1} max={5} onChange={v => update({ lives: v })} />
        </Row>
      )}
      <RandomStartRow checked={randomStart} onChange={v => update({ randomStart: v })} />
    </>
  );
}
