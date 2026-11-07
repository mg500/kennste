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
- **Neue Layouts/Screens:** erst als Mockup im Design-Canvas https://claude.ai/artifact/TN8CoRZB3sxapCT2keMXQm ergänzen (eine Seite je Bereich: Start & Musik, Lobby, TV verbinden, Buzzer, Zeitstrahl, Weiter, Jahr schätzen, Song-Tipp, Zuschauen & Spielende, Auflösung & Punkte, Stil „Minimal“, Stil „Hell“, Stil „Bühne“; neue Spielmodi bekommen eine eigene Seite; auf jeder Seite Handy, Laptop und TV als Zeilen untereinander, dieselbe Ansicht in einer Spalte, Titel mit Gerät vorne, z. B. „Handy – Auflösung“), Freigabe abwarten, dann umsetzen. Kleine Ergänzungen im bestehenden Stil brauchen kein Mockup.
- **Prüfen vor dem Commit:** `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; bei Änderungen an Abläufen oder Layout auch `npm run e2e` (baut selbst, ca. 15 s).
- **Visuell prüfen ohne Spotify:** Abläufe und „ist sichtbar“ per Playwright-Test (`e2e/`, Screenshots dort mit `page.screenshot()`); für einzelne Spielzustände weiterhin die temporäre Seite `src/app/zz-preview/page.tsx`, die Spielzustände mit dem echten Reducer baut; Screenshots mit Headless Brave (`/Applications/Brave Browser.app`, Chrome ist nicht installiert). Handy: 390px-iframes in einer lokalen HTML-Datei (Headless hat eine Mindest-Fensterbreite), Desktop: 1440×900. Keine Seiten mit offenem Event-Stream fotografieren (Headless hängt). Vor dem Commit Vorschauseite und `.next/dev/types` löschen.
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
- **Playwright-E2E-Tests** gegen den Produktions-Build mit dem Spotify-Simulator als HTTP-Server (`e2e/spotify-server.mts`, Ports 3100/3199, Konfiguration in `playwright.config.ts`). Die App spricht dabei über `SPOTIFY_API_URL`/`SPOTIFY_ACCOUNTS_URL`/`MUSICBRAINZ_URL` mit dem Simulator; der Host meldet sich per Test-Login an, der nur mit `E2E_TEST_LOGIN=1` *und* gesetzter `SPOTIFY_API_URL` existiert (`src/lib/auth.ts`). Läuft in der CI vor dem Docker-Build.
- Stile (Nov. 2026 neu gestaltet, die bunten „Dunkel“/„Hell“ mit vier Neonfarben gefielen nicht): „Minimal“ (Standard), „Hell“ (`light`, Minimal auf hellem Grund, schwarzer Buzzer) und „Bühne“ (`stage`, warmes Dunkel, Bernstein + Koralle, Lichtschein per `Decor`). Grundsatz: flach, höchstens zwei Akzentfarben. Akzentfarben als Schrift über `text-primary-text`/`text-buzz-text`/`text-positive-text`, nicht `text-primary` usw. – sonst ist die Schrift in „Hell“ auf Weiß unlesbar. Schrift auf Akzentflächen ist `text-on-accent`; auf `bg-buzz` wird daraus automatisch `--on-buzz` (weiß auf dem schwarzen Buzzer in „Hell“). Lesbarkeit aller Stile prüft `ThemeToggle.test.tsx`.

## Noch nie mit echtem Spotify getestet
Durch Unit-/Render-Tests, Szenarien gegen den Spotify-Simulator (`src/test/spotifySim.ts`) und Screenshots abgedeckt – bei Fehlerberichten zuerst `/diagnose` laufen lassen (prüft Abspielen, Startstelle, Playlists, Warteschlange, Shuffle mit echtem Spotify, je Gerät wählbar) und hier schauen (`src/lib/game/store.ts`: `pollPlayback`, `resumeIfLoaded`):
- Autoplay im Playlist-Modus und bei Zeitstrahl
- Timer starten erst bei tatsächlicher Wiedergabe (`onPlaying`)
- Pause/Play setzt fort statt neu zu starten
- TV verbinden am echten Fernseher-Browser (Skalierung per CSS-`zoom` auf 1920×1080, `useTvScale` – ältere TV-Browser ohne `zoom` würden wieder scrollen; Abfrage alle 2 s, Zahlentasten der Fernbedienung, QR-Scan mit der Handy-Kamera öffnet `/tv/pair/<code>` im Browser, in dem der Host angemeldet ist)
- Weitermachen per Mehrheit/Vibration am echten Handy (fester Weiter-Button, `navigator.vibrate` nur Android)
- Buzzer: Ausschnittlänge (`schedulePlayLimit` pausiert per Server-Timer); zufällige Startstelle (`position_ms` beim Abspielen über das Album) per Diagnose am Mac und am Pixel 9 bestätigt (1:00 angefordert, 1:01 gespielt), im Spiel noch nicht gesehen
- Wiedergabegerät wählen (`/api/game/[id]/devices`: Geräteliste, Übertragen per `PUT /me/player`, `device_id` bei jedem Abspielen; ruhende Geräte per Übertragung wecken + 2 Wiederholversuche in `runEffect`; nach dem Abspielen prüft `ensurePlaying`, ob der Song wirklich läuft, sonst Übertragung mit `play: true` und nochmal abspielen; 403 bei Pause/Fortsetzen gilt als „schon erledigt“)
- Songs werden über ihr Album gestartet (siehe `docs/development.md`, „Notes on the Spotify API“); per Diagnose am Mac und am Pixel 9 (Android, Okt. 2026) bestätigt, im Spiel noch nicht getestet – auch nicht, ob Timer/Ausschnittlänge mit einer anderen Fassung (`sameTrack`) greifen
- Fremde Playlists nachladen: Warteschlange ab Position, Shuffle aus/wieder an und Fortsetzen der vorherigen Musik per Diagnose am Mac bestätigt (Mac startet einen Song zu spät, Shuffle und Play/Pause wirken verzögert – alles im Simulator nachgebildet und ausgeglichen). Am Pixel 9 (Okt. 2026) liest die Diagnose die Warteschlange mit und ohne Shuffle in Playlist-Reihenfolge und zwei Blöcke ohne Doppelte – in einem zweiten Lauf aber einmal nur 4 statt 21 Songs; seitdem liest die App bis zu 4× nach (`QUEUE_READS`), im folgenden Lauf war sie gleich vollständig – ob das erneute Lesen im Ernstfall reicht, ist noch nicht gesehen („vollständig erst beim N. Lesen“). Nachladen im laufenden Spiel (`loadMoreSongs` vor Start/„Weiter“) noch nicht gesehen
- Spotify-Zugang erneuern nach 1 h (`getHostToken`): nur gegen den Simulator getestet
- Lobby-Musik (`/api/game/[id]/music`, Playlist per `context_uri`) und Wiedergabestatus mit Titel in der Lobby (`pollLobbyPlayback`)
- Stöbern nach Jahrzehnt und Genre (Suchfilter `year:`/`genre:`, `src/lib/browse.ts`): Diagnose (Okt. 2026): Jahrzehnt-Filter greift, liefert aber nur 5 statt 10 Songs pro Seite (im Simulator nachgebildet, `yearOnlySearchPage`; Stöbern blättert bis zu einer leeren Seite), 90er + Rock liefert 10 Treffer. Alle Genres (`GENRES`) liefern allein je 10 Treffer, mit den 80ern auch – außer Deutsch (`german pop`: 0) und Hip-Hop (8). Welcher Genre-Name deutsche 80er-Musik findet, prüft die Diagnose („Deutsche Musik der 80er“, Kandidaten in `GERMAN_CANDIDATES`); danach `GENRES` anpassen
- Wie eine App am Handy (Wischen und Zurück-Geste bei Menüs, Startbildschirm-Icon, Vollbild): nur in Chromium (Playwright) und happy-dom getestet, nicht auf echtem iPhone/Android
- Songs des Abends als Playlist speichern (Lobby, `createPlaylist`/`addToPlaylist` in `src/lib/spotify.ts`; spätere Spiele kommen in dieselbe Playlist: `POST /me/playlists`, `POST /playlists/{id}/items`, Berechtigung `playlist-modify-private`): Anlegen/Hinzufügen per Diagnose bestätigt (Okt. 2026, nutzt die Test-Playlist „Kennste?! – Diagnose“ wieder); Speichern und Hinzufügen im Spiel noch nicht gesehen. Hosts, die vor der neuen Berechtigung angemeldet waren, müssen sich einmal ab- und wieder anmelden
- Playlist wählen startet sie in der Lobby (fremde ab dem zuletzt gelesenen Block bzw. bei kurzer Playlist oder unbekannter Länge dort, wo das Einlesen pausiert hat; eigene ab zufälligem Song, `playPlaylist`; Fehler beim Weiterspielen stehen als `playlistPlayOn` im Log); in der Lobby gehörte Songs kommen im Spiel zuletzt (`heardLast`) – nur gegen den Simulator getestet
- Countdown zum Spielstart: Songs lesen und Jahre prüfen während der 5 s (`prepareStart`), Start per Server-Timer – nur gegen den Simulator getestet
- Musik einrichten (`/setup`): Überspringen auf der Startseite, Musik beim Gerätewechsel mitnehmen, Testsong, Gerät wird ins neue Spiel übernommen
- Pause am Songende (Nov. 2026, `watchSongEnd` in `store.ts`): pausiert 0,7 s vor dem Ende, damit das Album nicht weiterläuft, bzw. wenn Spotify direkt nach dem Ende weitergesprungen ist (Log `songEnded`) – nur gegen den Simulator getestet; ob die Pause am Mac/Handy rechtzeitig ankommt, noch nicht gesehen
- Musik läuft in der Lobby weiter (Nov. 2026, `continueInLobby` in `store.ts`): nach Abbruch/Spielende spielt der laufende Song zu Ende, dann übernimmt die Playlist (statt des Albums); läuft nichts, startet sie sofort – nur gegen den Simulator getestet
- Zuletzt gehörte Songs als Vorschläge für den Testsong (Nov. 2026, `fetchRecentlyPlayed` in `src/lib/spotify.ts`, `GET /me/player/recently-played`, Berechtigung `user-read-recently-played`): Prüfung „Zuletzt gehörte Songs lesen“ in der Diagnose ergänzt, noch nicht gelaufen; der Simulator bildet bisher nur die dokumentierte Antwort nach. Hosts, die vor der neuen Berechtigung angemeldet waren, müssen sich einmal ab- und wieder anmelden
- Lobby-Song beim Start (`noteLobbySong`): was beim Start läuft, kommt im Spiel zuletzt; ein neuer Song startet immer von vorn (`resumeIfLoaded` nur für den Play-Button) – nur gegen den Simulator getestet

## Ausblick: Arbeiten mit Feature-Branches
Aktuell wird direkt auf `main` committet. Später: Feature-Branch → lokal testen → Push + Pull Request (erst der PR startet die CI; aus dem eigenen Repo entsteht ein Test-Image `pr-<Nummer>`) → **Squash and merge** mit PR-Titel im Schema `feat:`/`fix:` (release-please liest nur den Titel, eine Changelog-Zeile pro PR) → Release-PR mergen, wenn released werden soll. Haken: Mit Pflicht-Checks für `main` lässt sich der Release-PR nicht mergen, weil er mit `GITHUB_TOKEN` angelegt wird und keine CI auslöst – entweder Admin-Ausnahme in der Branch-Regel oder release-please ein Token einer GitHub-App geben.

## Offen: Veröffentlichung (Repo ist noch privat)
Entschieden (Okt. 2026): Das Repo bleibt privat und die App läuft auf `edge`, bis die Tests am echten Spotify durch sind. Erst dann Release 1.0.0 und öffentlich. Vorbereitet ist alles im Repo (README-Hinweis zu den Spotify-Richtlinien, `/api/health`, CI mit Smoke-Test/Trivy/SBOM/cosign, Dependabot, release-please, `SECURITY.md`). Reihenfolge:
1. **Pushen, CI grün bekommen, solange privat:** Der Docker-Build lief erstmals (Okt. 2026, `/api/health` zeigte `edge` mit Commit); der Lauf ohne Chart-Job steht noch aus. Das Paket `kennste` auf ghcr.io ist privat – der Server braucht `docker login ghcr.io`. Unter *Actions → General* „Allow GitHub Actions to create and approve pull requests“ einschalten, sonst schlägt der Release-Job fehl (das `edge`-Image entsteht trotzdem). Den Release-PR bis dahin offen lassen.
2. **Auf dem eigenen Server mit `edge` testen** (siehe „Noch nie mit echtem Spotify getestet“, vor allem Spotify-Zugang erneuern nach 1 h: ein Spiel bewusst länger als eine Stunde laufen lassen). Kein automatisches Update auf `edge` (kein Watchtower) – ein Neustart beendet laufende Spiele.
3. **Historie bereinigt (Okt. 2026):** Alle Commits laufen auf „Max Goeb“ mit der GitHub-Noreply-Adresse, die private Adresse ist auch aus alten Fassungen dieser Datei entfernt; `bootstrap-sha` zeigt auf den neuen Hash. Bewusst nicht gesquasht (die kleinen Commits mit ihren Tests zeigen die Arbeitsweise) und nicht übersetzt (Commit-Messages bis Okt. 2026 deutsch, steht in `docs/development.md`). In den GitHub-Einstellungen „Keep my email addresses private“ und „Block command line pushes that expose my email“ einschalten. Für den Changelog von 1.0.0 im Release-PR die lange (teils deutsche) Liste durch eine kurze englische Zusammenfassung ersetzen.
4. **Release-PR 1.0.0 mergen** – erst dann gibt es `latest`, auf das README, `docker-compose.example.yml` und `SECURITY.md` verweisen. Vorher nicht öffentlich schalten.
5. **Öffentlich schalten:** Repo und Paket `kennste` auf *Public* · *Code security* „Private vulnerability reporting“ (darauf verweist `SECURITY.md`; im privaten Repo nutzlos) · *About*: Beschreibung „Self-hosted music quiz for game nights – phones as buzzers, Spotify as the music source“, Topics `music-quiz`, `party-game`, `spotify`, `nextjs`, `self-hosted`, `docker` · AGENTS.md vorher einmal mit fremdem Blick lesen (wird mit veröffentlicht).
6. Danach: Dependabot-PRs für die neuen Hauptversionen der Actions (checkout v7 usw.) einzeln mergen; optional das Node-Basis-Image per Digest festnageln; Branch-Regel für `main` mit dem Feature-Branch-Ablauf (siehe „Ausblick“).

## DevOps: bewusst schlank (Okt. 2026 aufgeräumt)
Betrieb ist eine Instanz per `docker compose`. Behalten: CI (Lint, Typecheck, Unit, E2E), Docker-Image mit Smoke-Test, Trivy (stoppt nur bei kritischen Lücken mit Fix), SBOM/Provenance, cosign, PR-Images `pr-<Nummer>` (werden gebraucht, sobald die App live ist), release-please, Dependabot (gruppiert), `/api/health` + sauberes Herunterfahren.
Wieder entfernt bzw. verworfen, weil es einem Partyspiel mit einer Instanz nichts bringt: Helm-Chart samt kind-Test und OCI-Veröffentlichung, Readiness-Route (`/api/health/ready`, nur für den Chart), Prometheus/Grafana, OpenSSF Scorecard, ADR-Ordner (die zwei wichtigen Entscheidungen stehen in `docs/development.md`, „Design decisions“), Replikas/Redis, Terraform, GitOps.
Noch offen:
1. **Pushen und den CI-Lauf prüfen:** Der Docker-Teil lief erstmals durch (`/api/health` des `edge`-Images zeigte `edge` mit Commit); den Lauf ohne Chart-Job noch prüfen.
2. Wenn die App live ist: alte `pr-*`-Images aufräumen (von Hand in den Paket-Einstellungen oder per Workflow beim Schließen des PRs).
3. Optional: Spotify-Fehler einheitlich und gut lesbar ins Log schreiben (ohne Metrik-Infrastruktur). Badges in der README: nur CI und Lizenz.

## Rückmeldungen vom Spieleabend (Okt. 2026): umgesetzt
Alle Punkte sind umgesetzt (Mockups im Design-Canvas freigegeben). Abweichungen davon: „Songsuche aus einer Playlist“ wurde „Stöbern nach Jahrzehnt und Genre“ (fremde Playlists sind im Development Mode nicht lesbar); bei „Alle gegen alle“ antwortet, wer buzzert, erst laut und sieht dann die Lösung; ein „Richtig“ müssen die anderen per Mehrheit bestätigen (ohne Zeitlimit, Musik läuft weiter), sonst gibt es keinen Punkt. Am echten Spotify noch nicht gesehen: siehe „Noch nie mit echtem Spotify getestet“.

## Offen / Ideen
- Zeitstrahl: Token-Regeln (andere Spieler klauen, Bonus für Titel + Interpret)
- Weitere Modus-Ideen: Musik-Bingo, Älter oder neuer?, Chronologie (4 Ausschnitte sortieren), Teams für alle Modi
- Genre-/Jahrzehnt-Filter
- Lyrics am TV (an/aus): Spotify liefert keine Songtexte; möglich wäre LRCLIB (frei, zeitsynchron, ohne Schlüssel). Verraten in fast allen Modi den Song – nur nach der Auflösung oder in der Lobby sinnvoll; rechtlich Grauzone, daher höchstens abschaltbar
