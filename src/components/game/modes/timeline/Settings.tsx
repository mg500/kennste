"use client";

import { Row, Stepper, Toggle } from "@/components/ui/primitives";
import { timelineData, type TimelineSettings } from "@/lib/game/modes/timeline";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act }, part }: ModeSettingsProps) {
  const { placeTimeLimit, coop, lives, randomStart } = timelineData(game).settings;
  const update = (patch: Partial<TimelineSettings>) => act({ type: "updateModeSettings", patch });
  const random = (
    <div className="border-b border-surface-2 py-1 last:border-0">
      <Toggle label="Zufällige Startstelle statt Intro" checked={randomStart} onChange={v => update({ randomStart: v })} />
    </div>
  );
  // In the team, the lives matter more than where songs start
  if (part === "more") return coop ? random : null;
  return (
    <>
      {coop && (
        <Row label="Leben">
          <Stepper label="Leben" value={lives} min={1} max={5} onChange={v => update({ lives: v })} />
        </Row>
      )}
      <Row label="Zeit zum Einordnen">
        <Stepper label="Zeit zum Einordnen" value={placeTimeLimit} display={placeTimeLimit === 0 ? "∞" : `${placeTimeLimit} s`}
          min={0} max={180} step={15} onChange={v => update({ placeTimeLimit: v })} />
      </Row>
      {!coop && random}
    </>
  );
}
