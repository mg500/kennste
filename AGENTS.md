<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Projekt-Notizen

Architektur, Funktionen und „Neuen Spielmodus hinzufügen“ stehen in `docs/development.md`, Einrichtung und Spielprinzip in der `README.md` (deutsche Fassung `README.de.md`). Hier steht, was nicht aus dem Code hervorgeht.

## Arbeitsweise
- Kommunikation mit dem Projektinhaber auf Deutsch.
- **Sprachen im Repo:** Oberfläche Deutsch. Englisch: Code, Kommentare, Commit-Messages, PR-Titel (landen per release-please im Changelog) und alles, was Besucher des Repos lesen – `README.md`, `docs/`, `SECURITY.md`. Ändert sich die README, `README.de.md` mitziehen. Diese Datei (`AGENTS.md`) bleibt deutsch.
- **Neue Layouts/Screens:** erst als Mockup im Design-Canvas ergänzen (Link in der lokalen `CLAUDE.local.md`) (eine Seite je Bereich: Start & Musik, Lobby, TV verbinden, Buzzer, Zeitstrahl, Weiter, Jahr schätzen, Song-Tipp, Zuschauen & Spielende, Auflösung & Punkte, Spielmenü, Stil „Dunkel“, Stil „Hell“, Stil „Bühne“; neue Spielmodi bekommen eine eigene Seite; auf jeder Seite Handy, Laptop und TV als Zeilen untereinander, dieselbe Ansicht in einer Spalte, Titel mit Gerät vorne, z. B. „Handy – Auflösung“), Freigabe abwarten, dann umsetzen. Kleine Ergänzungen im bestehenden Stil brauchen kein Mockup.
- **Prüfen vor dem Commit:** `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; bei Änderungen an Abläufen oder Layout auch `npm run e2e` (baut selbst, ca. 15 s).
- **Visuell prüfen ohne Spotify:** Abläufe und „ist sichtbar“ per Playwright-Test (`e2e/`, Screenshots dort mit `page.screenshot()`); für einzelne Spielzustände weiterhin die temporäre Seite `src/app/zz-preview/page.tsx`, die Spielzustände mit dem echten Reducer baut; Screenshots mit einem Headless-Browser. Handy: 390px-iframes in einer lokalen HTML-Datei (Headless hat eine Mindest-Fensterbreite), Desktop: 1440×900. Keine Seiten mit offenem Event-Stream fotografieren (Headless hängt). Vor dem Commit Vorschauseite und `.next/dev/types` löschen.
- Jeden abgeschlossenen Schritt einzeln committen, Commit-Message auf Englisch im Stil `feat:`/`fix:`/`refactor:` (bis Okt. 2026 deutsch).

## Grundsätze fürs Spiel (aus dem Spieleabend, Okt. 2026)
Gelten für alle Modi – bei jeder Änderung an einem Modus prüfen, ob sie für die anderen genauso gilt, und dort mit umsetzen.
- **Der Server treibt das Spiel voran, nie ein Handy:** Zeitablauf, automatisches Auflösen und Weitermachen laufen per Server-Timer (`deadline`/`scheduleDeadline`, `scheduleContinue`). Handys stoppen Timer im Hintergrund oder gehen offline; ein Spieler in einer anderen App darf nichts aufhalten.
- **Die aktuelle Auswahl zählt:** Was jemand eingestellt oder angetippt hat, geht sofort (als Entwurf) an den Server und zählt bei Zeitablauf. Buttons signalisieren „Fertig“ (früher auflösen), sie sind nicht die einzige Art abzugeben.
- **Automatisch weiter, wenn niemand mehr etwas tun kann** (alle haben geantwortet oder übersprungen) – kein Warten auf einen Klick, der nichts mehr entscheidet.
- **Jedes Gerät sieht nur, was es sehen darf:** Der Server schickt jedem Gerät seine eigene Ansicht (`view` je Modus, `src/lib/game/view.ts`) – Song und fremde Tipps erst nach der Auflösung. Neue Felder im Spielstand dort mitdenken.
- **Der TV zeigt alles, was alle betrifft:** während der Runde den Stand jedes Spielers (getippt, übersprungen, gebuzzert), nach der Auflösung alle Antworten mit Punkten. Kommt am Handy eine Info dazu, prüfen, ob sie auf den TV gehört.
- **Nichts springt:** wechselnde Zahlen (Timer, Zähler) mit fester Breite (`TimerDigits`, `tabular-nums`), damit Überschriften nicht neu umbrechen; große Ansichten nutzen die ganze Breite.
- **Eingaben gehen nicht verloren:** Suche, Auswahl und Entwürfe am Handy überstehen Rundenwechsel und Neuladen.
- **Song-Daten sind für jede Quelle gleich verlässlich:** Erscheinungsjahre laufen immer über MusicBrainz (`releaseYear.ts`), egal ob der Song aus einer Playlist kommt oder selbst gesucht ist.
- **Nach der Auflösung heißt Grün nur „richtig“** (Nov. 2026): Der Akzent (`primary`) folgt in „Dunkel“ und „Hell“ dem Cover und hat damit keine feste Bedeutung (grüne Cover werden zu Gelb/Türkis verschoben). Was nach der Auflösung „deins“ markiert, nimmt deshalb nicht `primary`: eigene falsche Wahl in der Buzzer-Farbe (`border-buzz`, `text-buzz-text`) mit ✗, richtige mit `positive` und ✓; Farben ohne Bedeutung (z. B. Nummern der Antworten) bleiben neutral. Vorbild: Vier Antworten, Zeitstrahl.
- **Texte ohne Zeitbezug** (Nov. 2026): nicht „Abend“, „heute“ o. Ä. – gespielt wird auch nachmittags oder über mehrere Tage. Allgemein formulieren: „Gespielte Songs“, „Das war's!“, „Rückblick auf alle Spiele“. (Im Code heißt das Konzept weiter `evening`.)
- **Fair für alle:** keine Hilfen, die nur einer Person nützen (z. B. eigene Playlists des Hosts im Vordergrund, Zufallssongs aus dessen Konto).

## Tests
Jede Änderung bringt ihre Tests mit, im selben Commit. Welcher Test wohin gehört (Details und Werkzeuge in `docs/development.md`, „Tests“):
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
- **Keine Datenbank:** Spielstand im Arbeitsspeicher, genau eine Instanz. Einzige Ausnahme (Nov. 2026, Wunsch nach „keine Songs doppelt über mehrere Spiele“): welche Songs die Spiele eines Hosts gespielt haben, als JSON-Datei in `DATA_DIR` (`src/lib/playedSongs.ts`, Image: `/data`). Kommt mehr dazu, das Thema Datenbank neu bewerten.
- **Image läuft als `node` (UID 1000)** (Nov. 2026, vorher eigener Benutzer `nextjs` mit 1001 aus dem Next.js-Beispiel): 1000 ist meist der erste Benutzer auf dem Host, ein dort angelegter Ordner für `/data` passt dann ohne `chown`. Nicht beschreibbares `DATA_DIR` meldet `checkDataDir` beim Start.
- **Playwright-E2E-Tests** gegen den Produktions-Build mit dem Spotify-Simulator als HTTP-Server (`e2e/spotify-server.mts`, Ports 3100/3199, Konfiguration in `playwright.config.ts`). Die App spricht dabei über `SPOTIFY_API_URL`/`SPOTIFY_ACCOUNTS_URL`/`MUSICBRAINZ_URL` mit dem Simulator; der Host meldet sich per Test-Login an, der nur mit `E2E_TEST_LOGIN=1` *und* gesetzter `SPOTIFY_API_URL` existiert (`src/lib/auth.ts`). Läuft in der CI vor dem Docker-Build.
- Stile (Nov. 2026 neu gestaltet, die bunten „Dunkel“/„Hell“ mit vier Neonfarben gefielen nicht): „Dunkel“ (`minimal`, bis Nov. 2026 Standard und „Minimal“ genannt), „Hell“ (`light`, Dunkel auf hellem Grund, schwarzer Buzzer) – beide seit Nov. 2026 ohne Spotify-Grün (Spotifys Richtlinien nennen es als Markenelement): Akzent in der Farbe des Covers (`coverAccent`, `useCoverAccent`), Bernstein bis ein farbiges Cover läuft, „richtig“ in eigenem Grün und „Bühne“ (`stage`, seit Nov. 2026 Standard, warmes Dunkel, Bernstein + Koralle, Lichtschein per `Decor`; seit Nov. 2026 in der Farbe des Covers des laufenden Songs, `game.stageColor` – Entscheidung: auch während der Runde und im Buzzer sofort, die Farbe verrät kaum etwas). Grundsatz: flach, höchstens zwei Akzentfarben. Akzentfarben als Schrift über `text-primary-text`/`text-buzz-text`/`text-positive-text`, nicht `text-primary` usw. – sonst ist die Schrift in „Hell“ auf Weiß unlesbar. Schrift auf Akzentflächen ist `text-on-accent`; auf `bg-buzz` wird daraus automatisch `--on-buzz` (weiß auf dem schwarzen Buzzer in „Hell“). Lesbarkeit aller Stile prüft `ThemeToggle.test.tsx`.

## Noch nie mit echtem Spotify getestet
Was am echten Spotify bestätigt ist und was nur gegen den Simulator läuft, steht in `docs/spotify-verification.md`. Bei Fehlerberichten zuerst `/diagnose` laufen lassen und dort nachsehen. Wird etwas am echten Gerät bestätigt oder kommt etwas Neues dazu, das nur gegen den Simulator getestet ist, die Liste im selben Commit anpassen.

## DevOps: bewusst schlank (Okt. 2026 aufgeräumt)
Betrieb ist eine Instanz per `docker compose`. Behalten: CI (Lint, Typecheck, Unit, E2E), Docker-Image mit Smoke-Test, Trivy (stoppt nur bei kritischen Lücken mit Fix), SBOM/Provenance, cosign, PR-Images `pr-<Nummer>` (werden gebraucht, sobald die App live ist), release-please, Dependabot (gruppiert), `/api/health` + sauberes Herunterfahren.
Wieder entfernt bzw. verworfen, weil es einem Partyspiel mit einer Instanz nichts bringt: Helm-Chart samt kind-Test und OCI-Veröffentlichung, Readiness-Route (`/api/health/ready`, nur für den Chart), Prometheus/Grafana, OpenSSF Scorecard, ADR-Ordner (die zwei wichtigen Entscheidungen stehen in `docs/development.md`, „Design decisions“), Replikas/Redis, Terraform, GitOps.
