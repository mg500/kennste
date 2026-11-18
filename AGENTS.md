<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Projekt-Notizen

Hier steht, was nicht aus dem Code hervorgeht. Sonst:
- `README.md` (deutsch: `README.de.md`): Einrichtung und Spielprinzip
- `docs/development.md`: Funktionen im Detail, Architektur, „Adding a game mode“, Hinweise zur Spotify-API, Ideen
- `docs/spotify-verification.md`: was am echten Spotify bestätigt ist und was nur gegen den Simulator läuft
- Skills in `.claude/skills/`: `new-game-mode` (Checkliste für Modi und Varianten), `spotify-assumption` (neue Annahme über Spotify: Diagnose → Simulator → Test), `update-docs` (Doku mit dem Code abgleichen, README-Bilder per `npm run docs:images` neu erzeugen)

## Arbeitsweise
- Kommunikation mit dem Projektinhaber auf Deutsch.
- **Sprachen im Repo:** Oberfläche Deutsch. Englisch: Code, Kommentare, Commit-Messages, PR-Titel (landen per release-please im Changelog) und alles, was Besucher des Repos lesen – `README.md`, `docs/`, `SECURITY.md`. Ändert sich die README, `README.de.md` mitziehen. Diese Datei bleibt deutsch.
- **Commits:** nie direkt auf `main` (das Repo ist öffentlich), sondern pro Thema ein Branch (`fix/…`, `feat/…`), darauf jeden abgeschlossenen Schritt einzeln, im Stil `feat:`/`fix:`/`refactor:`/`docs:` (bis Okt. 2026 waren sie deutsch).
- **Pull Requests:** gegen `main`, gemergt per „Squash and merge“ – release-please liest nur den PR-Titel (eine Zeile im Changelog), er braucht also denselben Stil. Die CI baut für den PR das Image `ghcr.io/mg500/kennste:pr-<Nummer>` zum Testen auf dem eigenen Server (neue Commits überschreiben es); nach dem Merge entsteht `edge`. Ein Release entsteht erst, wenn der Release-PR von release-please gemergt wird (Image `x.y.z`, `x.y`, `x`, `latest`).
- **Prüfen vor dem Commit:** `npm run check` (Typecheck, Lint, Unit-Tests, Build); bei Änderungen an Abläufen oder Layout auch `npm run e2e` (baut selbst, ca. 15 s).
- **Neue Layouts/Screens:** erst als Mockup im Design-Canvas ergänzen (Link und Aufbau nur lokal: `CLAUDE.local.md`), Freigabe abwarten, dann umsetzen. Kleine Ergänzungen im bestehenden Stil brauchen kein Mockup.
- **Visuell prüfen ohne Spotify:** Abläufe und „ist sichtbar“ per Playwright-Test (`e2e/`, Screenshots mit `page.screenshot()`); einzelne Spielzustände über eine temporäre Seite `src/app/zz-preview/page.tsx`, die sie mit dem echten Reducer baut (Ablauf lokal im Skill `preview-screenshot`). Keine Seiten mit offenem Event-Stream fotografieren (Headless hängt). Vor dem Commit Vorschauseite und `.next/dev/types` löschen.

## Grundsätze fürs Spiel
Aus dem ersten Spieleabend (Okt. 2026). Gelten für alle Modi – bei jeder Änderung an einem Modus prüfen, ob sie für die anderen genauso gilt, und dort mit umsetzen.
- **Der Server treibt das Spiel voran, nie ein Handy:** Zeitablauf, automatisches Auflösen und Weitermachen laufen per Server-Timer (`deadline`/`scheduleDeadline`, `scheduleContinue`). Handys stoppen Timer im Hintergrund oder gehen offline; ein Spieler in einer anderen App darf nichts aufhalten.
- **Die aktuelle Auswahl zählt:** Was jemand eingestellt oder angetippt hat, geht sofort (als Entwurf) an den Server und zählt bei Zeitablauf. Buttons signalisieren „Fertig“ (früher auflösen), sie sind nicht die einzige Art abzugeben.
- **Automatisch weiter, wenn niemand mehr etwas tun kann** (alle haben geantwortet oder übersprungen) – kein Warten auf einen Klick, der nichts mehr entscheidet.
- **Jedes Gerät sieht nur, was es sehen darf:** Der Server schickt jedem Gerät seine eigene Ansicht (`view` je Modus, `src/lib/game/view.ts`) – Song und fremde Tipps erst nach der Auflösung. Neue Felder im Spielstand dort mitdenken.
- **Der TV zeigt alles, was alle betrifft:** während der Runde den Stand jedes Spielers (getippt, übersprungen, gebuzzert), nach der Auflösung alle Antworten mit Punkten. Kommt am Handy eine Info dazu, prüfen, ob sie auf den TV gehört.
- **Eingaben gehen nicht verloren:** Suche, Auswahl und Entwürfe am Handy überstehen Rundenwechsel und Neuladen.
- **Song-Daten sind für jede Quelle gleich verlässlich:** Erscheinungsjahre laufen immer über MusicBrainz (`releaseYear.ts`), egal ob der Song aus einer Playlist kommt oder selbst gesucht ist.
- **Fair für alle:** keine Hilfen, die nur einer Person nützen (z. B. eigene Playlists des Hosts im Vordergrund, Zufallssongs aus dessen Konto).

## Gestaltung
- **Stile:** „Bühne“ (`stage`, Standard: warmes Dunkel, Bernstein + Koralle, Lichtschein per `Decor` in der Farbe des Covers, `game.stageColor` – auch während der Runde und im Buzzer, die Farbe verrät kaum etwas), „Dunkel“ (`minimal`) und „Hell“ (`light`, schwarzer Buzzer). Grundsatz: flach, höchstens zwei Akzentfarben. Die bunten Fassungen mit vier Neonfarben gefielen nicht.
- **Kein Spotify-Grün:** Spotifys Richtlinien nennen es als Markenelement. In „Dunkel“ und „Hell“ folgt der Akzent (`primary`) dem Cover (`coverAccent`, `useCoverAccent`), Bernstein bis ein farbiges Cover läuft, grüne Cover werden zu Gelb/Türkis verschoben.
- **Nach der Auflösung heißt Grün nur „richtig“:** Weil `primary` keine feste Bedeutung hat, nimmt, was nach der Auflösung „deins“ markiert, nicht `primary`: eigene falsche Wahl in der Buzzer-Farbe (`border-buzz`, `text-buzz-text`) mit ✗, richtige mit `positive` und ✓; Farben ohne Bedeutung (z. B. Nummern der Antworten) bleiben neutral. Vorbild: Vier Antworten, Zeitstrahl.
- **Lesbarkeit:** Akzentfarben als Schrift über `text-primary-text`/`text-buzz-text`/`text-positive-text`, nicht `text-primary` usw. – sonst ist die Schrift in „Hell“ auf Weiß unlesbar. Schrift auf Akzentflächen ist `text-on-accent`; auf `bg-buzz` wird daraus automatisch `--on-buzz`. Lesbarkeit aller Stile prüft `ThemeToggle.test.tsx`.
- **Nichts springt:** wechselnde Zahlen (Timer, Zähler) mit fester Breite (`TimerDigits`, `tabular-nums`), damit Überschriften nicht neu umbrechen; große Ansichten nutzen die ganze Breite.
- **Texte ohne Zeitbezug:** nicht „Abend“, „heute“ o. Ä. – gespielt wird auch nachmittags oder über mehrere Tage. Allgemein formulieren: „Gespielte Songs“, „Das war's!“, „Rückblick auf alle Spiele“. (Im Code heißt das Konzept weiter `evening`.)

## Tests
Jede Änderung bringt ihre Tests mit, im selben Commit. Welcher Test wohin gehört (Werkzeuge in `docs/development.md`, „Tests“):
- **Spiellogik** (Reducer, Modi): Unit-Test neben der Datei (`reducer.test.ts`, `modes/*.test.ts`).
- **Server-Abläufe mit Spotify** (Routen, Store, Nachladen, Geräte, Token): Szenario gegen den Spotify-Simulator (`src/lib/game/scenarios.test.ts`, `src/test/spotifySim.ts`).
- **Was eine Rolle sieht** (Texte, Buttons je Spieler/Host/TV): Render-Test (`GameView.test.tsx`, `modes/*/…test.tsx`).
- **Browser-Verhalten** (Klicks, Timer, Event-Stream, Hooks): happy-dom-Test (`// @vitest-environment happy-dom`).
- **Abläufe über mehrere Geräte und Layout** (Beitreten, TV, Weitermachen per Mehrheit, sichtbare Buttons): Playwright-Test in `e2e/` – wenige, aussagekräftige Abläufe, nicht jeden Button. Helfer in `e2e/helpers.ts` (`hostGame`, `join`, `phone`/`smallPhone`/`tv`, Simulator zurücksetzen und abfragen).

Regeln:
- **Jeder Bugfix bekommt einen Test, der ohne den Fix fehlschlägt** – kurz gegenprüfen (Fix rückgängig machen, Test muss rot werden; dazu die Datei sichern, nicht `git checkout`, das verwirft auch andere ungespeicherte Änderungen).
- **E2E-Tests müssen den Fehlerfall wirklich herstellen:** Desktop-Chromium verhält sich anders als Handy-Browser (hält z. B. den Event-Stream offline offen; Nachbau des Abbruchs in `e2e/connection.spec.ts`), und auf einem großen Bildschirm ist auch ein nicht fixierter Button sichtbar (deshalb `smallPhone`). Gegenprobe wie bei Bugfixes.
- Keine Tests, die nur Zeilen abdecken; getestet wird Verhalten, das ein Spieler oder der Host merken würde.

## Spotify
- **Der Simulator bildet nur Verhalten nach, das am echten Spotify gesehen wurde.** Neue Annahmen über Spotify erst mit `/diagnose` am echten Gerät prüfen (Prüfung dort ergänzen, Projektinhaber laufen lassen), dann im Simulator nachbilden und darauf testen. So hat die Diagnose die Shuffle-Verzögerung, den Versatz der Startposition am Mac und die verzögerte Statusmeldung gefunden, die der Simulator vorher nicht kannte.
- Neue Spotify-Endpunkte im Code → im Simulator ergänzen (sonst antwortet er 404 „not implemented“).
- **Bei Fehlerberichten aus echten Spielen** zuerst `/diagnose` laufen lassen und in `docs/spotify-verification.md` nachsehen. Wird dort etwas bestätigt oder kommt etwas dazu, das nur gegen den Simulator getestet ist, die Liste im selben Commit anpassen.

## Leitplanken
- **Keine Datenbank:** Spielstand im Arbeitsspeicher, genau eine Instanz. Einzige Ausnahme: welche Songs die Spiele eines Hosts gespielt haben, als JSON-Datei in `DATA_DIR` (`src/lib/playedSongs.ts`). Kommt mehr dazu, das Thema Datenbank neu bewerten.
- **Betrieb bewusst schlank:** eine Instanz per `docker compose`. Bewusst verworfen, weil es einem Partyspiel mit einer Instanz nichts bringt: Helm-Chart, Readiness-Route, Prometheus/Grafana, OpenSSF Scorecard, ADR-Ordner, Replikas/Redis, Terraform, GitOps – nicht wieder vorschlagen, ohne dass sich am Betrieb etwas ändert.
- **Image läuft als `node` (UID 1000):** meist der erste Benutzer auf dem Host, ein dort angelegter Ordner für `/data` passt dann ohne `chown`. Nicht beschreibbares `DATA_DIR` meldet `checkDataDir` beim Start.
- **Test- und Hilfscode gehört in `.dockerignore`:** Der Build im Image prüft alle TypeScript-Dateien, `e2e/` fehlt dort aber. Was `e2e/` importiert (z. B. `scripts/docs-images/`), muss ebenfalls raus – lokal fällt das bei `npm run build` nicht auf.
- **Kein `next/image`:** Das Docker-Image entfernt `sharp` (siehe `docs/development.md`, „Docker image“).
- **E2E-Test-Login** existiert nur mit `E2E_TEST_LOGIN=1` *und* gesetzter `SPOTIFY_API_URL` (`src/lib/auth.ts`) – diese doppelte Bedingung nicht aufweichen.
