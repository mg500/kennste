<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Projekt-Notizen

Architektur, Funktionen und „Neuen Spielmodus hinzufügen“ stehen in der `README.md`. Hier steht, was nicht aus dem Code hervorgeht.

## Arbeitsweise
- Kommunikation mit dem Projektinhaber auf Deutsch.
- **Neue Layouts/Screens:** erst als Mockup im Design-Canvas https://claude.ai/artifact/TN8CoRZB3sxapCT2keMXQm ergänzen (Reihen: Handy „Party“, TV-Ansicht + Zuschauen am Handy + „Minimal“, Laptop/PC), Freigabe abwarten, dann umsetzen. Kleine Ergänzungen im bestehenden Stil brauchen kein Mockup.
- **Prüfen vor dem Commit:** `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- **Visuell prüfen ohne Spotify:** temporäre Seite `src/app/zz-preview/page.tsx`, die Spielzustände mit dem echten Reducer baut; Screenshots mit Headless Brave (`/Applications/Brave Browser.app`, Chrome ist nicht installiert). Handy: 390px-iframes in einer lokalen HTML-Datei (Headless hat eine Mindest-Fensterbreite), Desktop: 1440×900. Keine Seiten mit offenem Event-Stream fotografieren (Headless hängt). Vor dem Commit Vorschauseite und `.next/dev/types` löschen.
- Jeden abgeschlossenen Schritt einzeln committen, Commit-Message auf Deutsch im Stil `feat:`/`fix:`/`refactor:`.

## Entscheidungen
- **Kein SQLite/Persistenz** vorerst: Zustand im Arbeitsspeicher, genau eine Instanz.
- **Keine Playwright-E2E-Tests** vorerst (wären mit einem Spotify-Mock-Server über konfigurierbare Basis-URLs machbar).
- Standard-Stil ist „Party“ (bunt), „Minimal“ ist umschaltbar.

## Noch nie mit echtem Spotify getestet
Nur durch Unit-/Render-Tests und Screenshots abgedeckt – bei Fehlerberichten zuerst hier schauen (`src/lib/game/store.ts`: `pollPlayback`, `resumeIfLoaded`):
- Autoplay im Playlist-Modus und bei Hitster
- Timer starten erst bei tatsächlicher Wiedergabe (`onPlaying`)
- Pause/Play setzt fort statt neu zu starten
- Tastenkürzel im echten Browser
- Jahr schätzen / Song-Tipp: Auflösen bei Zeitablauf (sendet der Host-Client, `useRoundTimeout` in `components/game/modes/allplay.tsx`)
- Buzzer: Ausschnittlänge (`schedulePlayLimit` pausiert per Server-Timer) und zufällige Startstelle (`position_ms` beim Abspielen)
- Wiedergabegerät wählen (`/api/game/[id]/devices`: Geräteliste, Übertragen per `PUT /me/player`, `device_id` bei jedem Abspielen; ruhende Geräte per Übertragung wecken + 2 Wiederholversuche in `runEffect`)
- Musik einrichten (`/setup`): Überspringen auf der Startseite, Musik beim Gerätewechsel mitnehmen, Testsong, Gerät wird ins neue Spiel übernommen

## Offen / Ideen
- Hitster: Token-Regeln (andere Spieler klauen, Bonus für Titel + Interpret)
- Weitere Modus-Ideen: Musik-Bingo, Älter oder neuer?, Chronologie (4 Ausschnitte sortieren), Teams für alle Modi
- Genre-/Jahrzehnt-Filter
- Bekannte Lücke: Der komplette Spielstand (inkl. aktuellem Buzzer-Song) geht an alle Clients – per Entwicklertools lesbar. Betrifft auch die Tipps bei „Jahr schätzen“ und die Antworten bei „Song-Tipp“ (vor der Auflösung abschreibbar; welche Song-Tipp-Antwort richtig ist, bleibt aber auf dem Server). Lösung wären pro Spieler gefilterte Ansichten.
