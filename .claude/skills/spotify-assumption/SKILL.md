---
name: spotify-assumption
description: Ablauf, wenn Code sich auf ein Verhalten von Spotify verlassen soll, das noch nicht am echten Spotify gesehen wurde – Prüfung in der Diagnose ergänzen, vom Projektinhaber laufen lassen, im Simulator nachbilden, testen. Verwenden bei neuen Spotify-Endpunkten, neuen Annahmen über Timing, Warteschlange, Shuffle, Geräte oder Suche, und bei Fehlerberichten aus echten Spielen.
---

# Neue Annahme über Spotify

Grundsatz: Der Simulator (`src/test/spotifySim.ts`) bildet nur Verhalten nach, das am echten Spotify gesehen wurde. Sonst laufen die Tests gegen eine ausgedachte API.

## Bei einem Fehlerbericht aus einem echten Spiel
1. In `docs/spotify-verification.md` nachsehen, ob der Bereich schon bestätigt ist.
2. Den Projektinhaber `/diagnose` am betroffenen Gerät laufen lassen und sich das Ergebnis geben lassen. Danach mit dem neuen Verhalten weiter wie unten.
3. Logs ansehen (`docker logs`): `songChange`, `songEnded`, `playlistPlayOn` (`src/lib/log.ts`).

## Neue Annahme prüfen
1. **Prüfung in der Diagnose ergänzen** (`src/lib/diagnose.ts`, `runDiagnosis`): ein `step(name, ok, detail)` mit Name und Detail auf Deutsch. `detail` nennt die gemessenen Werte (Zeiten, Anzahlen, Statuscodes), nicht nur ok/nicht ok. Danach den vorherigen Zustand wiederherstellen (siehe `snapshotPlayer`). Test dazu in `src/lib/diagnose.test.ts` gegen den Simulator.
2. **Stop: Der Projektinhaber lässt die Diagnose laufen,** am besten auf Mac und Handy. Nicht raten, wie das Ergebnis aussieht.
3. **Im Simulator nachbilden**, was die Diagnose gezeigt hat, mit einem Kommentar dazu, wo und wann es gesehen wurde (Vorbild: `lag`, `yearOnlySearchPage`). Neue Endpunkte ergänzen, sonst antwortet er 404 „not implemented“.
4. **App-Code anpassen** und mit einem Szenario in `src/lib/game/scenarios.test.ts` testen, das ohne die Anpassung fehlschlägt.
5. **Dokumentieren:** Verhalten in `docs/development.md` („Notes on the Spotify API“), Stand in `docs/spotify-verification.md` (bestätigt per Diagnose / im Spiel gesehen / nur Simulator).

## Neue Berechtigung (Scope)
Hosts, die vor der neuen Berechtigung angemeldet waren, müssen sich einmal ab- und wieder anmelden. Die Diagnose soll bei 401/403 genau das sagen; den Hinweis auch in `docs/spotify-verification.md` aufnehmen.
