import { OPTION_COUNT, POINTS_CORRECT, POINTS_FASTEST } from "@/lib/game/modes/choice";

export function Rules() {
  return (
    <>
      <p>Ein Song aus der Playlist läuft, und <strong>alle gleichzeitig</strong> wählen aus {OPTION_COUNT} Antworten den richtigen <strong>Titel</strong> oder <strong>Interpreten</strong>.</p>
      <p>Die erste Antwort zählt – ändern geht nicht. Aufgelöst wird, sobald alle geantwortet haben oder die Zeit abgelaufen ist.</p>
      <p>Richtig: <strong>{POINTS_CORRECT} Punkte</strong>. Wer als Erstes richtig liegt, bekommt <strong>{POINTS_FASTEST} Bonuspunkt</strong> dazu.</p>
    </>
  );
}
