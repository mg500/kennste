"use client";

import { Row, Segmented, Stepper } from "@/components/ui/primitives";
import { timelineData, type TimelineSettings } from "@/lib/game/modes/timeline";
import type { ModeSettingsProps } from "../types";

export function Settings({ game, controls: { act } }: ModeSettingsProps) {
  const { startCards, placeTimeLimit, coop, lives } = timelineData(game).settings;
  const update = (patch: Partial<TimelineSettings>) => act({ type: "updateModeSettings", patch });
  return (
    <>
      <Row label="Spielweise">
        <Segmented value={coop ? "coop" : "versus"} onChange={v => update({ coop: v === "coop" })}
          options={[{ value: "versus", label: "Gegeneinander" }, { value: "coop", label: "Gemeinsam" }]} />
      </Row>
      {coop && (
        <Row label="Leben">
          <Stepper label="Leben" value={lives} min={1} max={5} onChange={v => update({ lives: v })} />
        </Row>
      )}
      <Row label={coop ? "Startkarten" : "Startkarten pro Spieler"}>
        <Stepper label="Startkarten" value={startCards} min={1} max={3} onChange={v => update({ startCards: v })} />
      </Row>
      <Row label="Zeit zum Einordnen">
        <Stepper label="Zeit zum Einordnen" value={placeTimeLimit} display={placeTimeLimit === 0 ? "∞" : `${placeTimeLimit} s`}
          min={0} max={180} step={15} onChange={v => update({ placeTimeLimit: v })} />
      </Row>
    </>
  );
}
