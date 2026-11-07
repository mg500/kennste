import { OPTION_COUNT, POINTS_CORRECT } from "@/lib/game/modes/choice";
import { SPEED_BONUS } from "@/lib/game/modes/play";

export function Rules() {
  return (
    <>
      <p>Ein Song aus der Playlist läuft, und <strong>alle gleichzeitig</strong> wählen aus {OPTION_COUNT} Antworten den richtigen <strong>Titel</strong> oder <strong>Interpreten</strong>.</p>
      <p>Die erste Antwort zählt – ändern geht nicht. Aufgelöst wird, sobald alle geantwortet haben oder die Zeit abgelaufen ist.</p>
      <p>Richtig: <strong>{POINTS_CORRECT} Punkte</strong>. Mit „Bonuspunkt für den Schnellsten“ bekommt, wer als Erstes richtig liegt, <strong>{SPEED_BONUS} Punkt</strong> dazu.</p>
    </>
  );
}
