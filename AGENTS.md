<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Projekt-Notizen

Architektur, Funktionen und „Neuen Spielmodus hinzufügen“ stehen in `docs/ENTWICKLUNG.md`, Einrichtung und Spielprinzip in der `README.md`. Hier steht, was nicht aus dem Code hervorgeht.

## Arbeitsweise
- Kommunikation mit dem Projektinhaber auf Deutsch.
- **Neue Layouts/Screens:** erst als Mockup im Design-Canvas https://claude.ai/artifact/TN8CoRZB3sxapCT2keMXQm ergänzen (eine Seite je Bereich: Start & Musik, Lobby, Buzzer, Zeitstrahl, Weiter, Jahr schätzen, Song-Tipp, Zuschauen & Spielende, Stil „Minimal“; neue Spielmodi bekommen eine eigene Seite; auf jeder Seite von links nach rechts Handy → TV → Laptop, Titel mit Gerät vorne, z. B. „Handy – Auflösung“), Freigabe abwarten, dann umsetzen. Kleine Ergänzungen im bestehenden Stil brauchen kein Mockup.
- **Prüfen vor dem Commit:** `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; bei Änderungen an Abläufen oder Layout auch `npm run e2e` (baut selbst, ca. 15 s).
- **Visuell prüfen ohne Spotify:** Abläufe und „ist sichtbar“ per Playwright-Test (`e2e/`, Screenshots dort mit `page.screenshot()`); für einzelne Spielzustände weiterhin die temporäre Seite `src/app/zz-preview/page.tsx`, die Spielzustände mit dem echten Reducer baut; Screenshots mit Headless Brave (`/Applications/Brave Browser.app`, Chrome ist nicht installiert). Handy: 390px-iframes in einer lokalen HTML-Datei (Headless hat eine Mindest-Fensterbreite), Desktop: 1440×900. Keine Seiten mit offenem Event-Stream fotografieren (Headless hängt). Vor dem Commit Vorschauseite und `.next/dev/types` löschen.
- Jeden abgeschlossenen Schritt einzeln committen, Commit-Message auf Deutsch im Stil `feat:`/`fix:`/`refactor:`.

## Tests
Jede Änderung bringt ihre Tests mit, im selben Commit. Welcher Test wohin gehört (Details und Werkzeuge in `docs/ENTWICKLUNG.md`, „Tests“):
- **Spiellogik** (Reducer, Modi): Unit-Test neben der Datei (`reducer.test.ts`, `modes/*.test.ts`).
- **Server-Abläufe mit Spotify** (Routen, Store, Nachladen, Geräte, Token): Szenario gegen den Spotify-Simulator (`src/lib/game/scenarios.test.ts`, `src/test/spotifySim.ts`).
- **Was eine Rolle sieht** (Texte, Buttons je Spieler/Host/TV): Render-Test (`GameView.test.tsx`, `modes/*/…test.tsx`).
- **Browser-Verhalten** (Klicks, Timer, Event-Stream, Hooks): happy-dom-Test (`// @vitest-environment happy-dom`).
- **Abläufe über mehrere Geräte und Layout** (Beitreten, TV, Weitermachen per Mehrheit, sichtbare Buttons): Playwright-Test in `e2e/` – wenige, aussagekräftige Abläufe, nicht jeden Button. Helfer in `e2e/helpers.ts` (`hostGame`, `join`, `phone`/`smallPhone`/`tv`, Simulator zurücksetzen und abfragen).

Regeln:
- **Jeder Bugfix bekommt einen Test, der ohne den Fix fehlschlägt** – kurz gegenprüfen (Fix rückgängig machen, Test muss rot werden; dazu die Datei sichern, nicht `git checkout`, das verwirft auch andere ungespeicherte Änderungen).
- **Der Simulator bildet nur Verhalten nach, das am echten Spotify gesehen wurde.** Neue Annahmen über Spotify erst mit `/diagnose` am echten Gerät prüfen (Prüfung dort ergänzen, Projektinhaber laufen lassen), dann im Simulator nachbilden und darauf testen. So hat die Diagnose die Shuffle-Verzögerung, den Versatz der Startposition am Mac und die verzögerte Statusmeldung gefunden, die der Simulator vorher nicht kannte.
- Neue Spotify-Endpunkte im Code → im Simulator ergänzen (sonst antwortet er 404 „not implemented“).
- **E2E-Tests müssen den Fehlerfall wirklich herstellen:** Desktop-Chromium verhält sich anders als Handy-Browser (hält z. B. den Event-Stream offline offen; Nachbau des Abbruchs in `e2e/connection.spec.ts`), und auf einem großen Bildschirm ist auch ein nicht fixierter Button sichtbar (deshalb `smallPhone`). Gegenprobe wie bei Bugfixes.
- Keine Tests, die nur Zeilen abdecken; getestet wird Verhalten, das ein Spieler oder der Host merken würde.
- Die CI (`.github/workflows/ci.yml`) führt Lint, Typecheck und alle Tests aus; das Docker-Image entsteht nur, wenn alles grün ist.

## Entscheidungen
- **Kein SQLite/Persistenz** vorerst: Zustand im Arbeitsspeicher, genau eine Instanz.
- **Playwright-E2E-Tests** gegen den Produktions-Build mit dem Spotify-Simulator als HTTP-Server (`e2e/spotify-server.mts`, Ports 3100/3199, Konfiguration in `playwright.config.ts`). Die App spricht dabei über `SPOTIFY_API_URL`/`SPOTIFY_ACCOUNTS_URL`/`MUSICBRAINZ_URL` mit dem Simulator; der Host meldet sich per Test-Login an, der nur mit `E2E_TEST_LOGIN=1` *und* gesetzter `SPOTIFY_API_URL` existiert (`src/lib/auth.ts`). Läuft in der CI vor dem Docker-Build.
- Standard-Stil ist „Party“ (bunt), „Minimal“ ist umschaltbar.

## Noch nie mit echtem Spotify getestet
Durch Unit-/Render-Tests, Szenarien gegen den Spotify-Simulator (`src/test/spotifySim.ts`) und Screenshots abgedeckt – bei Fehlerberichten zuerst `/diagnose` laufen lassen (prüft Abspielen, Startstelle, Playlists, Warteschlange, Shuffle mit echtem Spotify, je Gerät wählbar) und hier schauen (`src/lib/game/store.ts`: `pollPlayback`, `resumeIfLoaded`):
- Autoplay im Playlist-Modus und bei Zeitstrahl
- Timer starten erst bei tatsächlicher Wiedergabe (`onPlaying`)
- Pause/Play setzt fort statt neu zu starten
- Weitermachen per Mehrheit/Vibration am echten Handy (fester Weiter-Button, `navigator.vibrate` nur Android)
- Jahr schätzen / Song-Tipp: Auflösen bei Zeitablauf (sendet der Host-Client, `useRoundTimeout` in `components/game/modes/allplay.tsx`)
- Buzzer: Ausschnittlänge (`schedulePlayLimit` pausiert per Server-Timer); zufällige Startstelle (`position_ms` beim Abspielen über das Album) prüft die Diagnose, im Spiel noch nicht gesehen
- Wiedergabegerät wählen (`/api/game/[id]/devices`: Geräteliste, Übertragen per `PUT /me/player`, `device_id` bei jedem Abspielen; ruhende Geräte per Übertragung wecken + 2 Wiederholversuche in `runEffect`; nach dem Abspielen prüft `ensurePlaying`, ob der Song wirklich läuft, sonst Übertragung mit `play: true` und nochmal abspielen; 403 bei Pause/Fortsetzen gilt als „schon erledigt“)
- Songs werden über ihr Album gestartet (siehe `docs/ENTWICKLUNG.md`, „Spotify-API-Hinweise“); per Diagnose am Mac bestätigt, im Spiel noch nicht getestet – auch nicht, ob Timer/Ausschnittlänge mit einer anderen Fassung (`sameTrack`) greifen
- Fremde Playlists nachladen: Warteschlange ab Position, Shuffle aus/wieder an und Fortsetzen der vorherigen Musik per Diagnose am Mac bestätigt (Mac startet einen Song zu spät, Shuffle und Play/Pause wirken verzögert – alles im Simulator nachgebildet und ausgeglichen). Nachladen im laufenden Spiel (`loadMoreSongs` vor Start/„Weiter“) noch nicht gesehen; andere Geräte als der Mac noch nicht geprüft
- Spotify-Zugang erneuern nach 1 h (`getHostToken`): nur gegen den Simulator getestet
- Lobby-Musik (`/api/game/[id]/music`, Playlist per `context_uri`) und Wiedergabestatus mit Titel in der Lobby (`pollLobbyPlayback`)
- Musik einrichten (`/setup`): Überspringen auf der Startseite, Musik beim Gerätewechsel mitnehmen, Testsong, Gerät wird ins neue Spiel übernommen

## Offen / Ideen
- Zeitstrahl: Token-Regeln (andere Spieler klauen, Bonus für Titel + Interpret)
- Weitere Modus-Ideen: Musik-Bingo, Älter oder neuer?, Chronologie (4 Ausschnitte sortieren), Teams für alle Modi
- Genre-/Jahrzehnt-Filter
- Bekannte Lücke: Der komplette Spielstand (inkl. aktuellem Buzzer-Song) geht an alle Clients – per Entwicklertools lesbar. Betrifft auch die Tipps bei „Jahr schätzen“ und die Antworten bei „Song-Tipp“ (vor der Auflösung abschreibbar; welche Song-Tipp-Antwort richtig ist, bleibt aber auf dem Server). Lösung wären pro Spieler gefilterte Ansichten.
