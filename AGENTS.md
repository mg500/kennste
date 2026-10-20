<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Projekt-Notizen

Architektur, Funktionen und „Neuen Spielmodus hinzufügen“ stehen in `docs/development.md`, Einrichtung und Spielprinzip in der `README.md` (deutsche Fassung `README.de.md`). Hier steht, was nicht aus dem Code hervorgeht.

## Arbeitsweise
- Kommunikation mit dem Projektinhaber auf Deutsch.
- **Sprachen im Repo:** Oberfläche Deutsch. Englisch: Code, Kommentare, Commit-Messages, PR-Titel (landen per release-please im Changelog) und alles, was Besucher des Repos lesen – `README.md`, `docs/`, `SECURITY.md`, Helm-Chart (`values.yaml`, `README.md.gotmpl`, `NOTES.txt`). Ändert sich die README, `README.de.md` mitziehen. Diese Datei (`AGENTS.md`) bleibt deutsch.
- **Neue Layouts/Screens:** erst als Mockup im Design-Canvas https://claude.ai/artifact/TN8CoRZB3sxapCT2keMXQm ergänzen (eine Seite je Bereich: Start & Musik, Lobby, TV verbinden, Buzzer, Zeitstrahl, Weiter, Jahr schätzen, Song-Tipp, Zuschauen & Spielende, Stil „Minimal“; neue Spielmodi bekommen eine eigene Seite; auf jeder Seite Handy, Laptop und TV als Zeilen untereinander, dieselbe Ansicht in einer Spalte, Titel mit Gerät vorne, z. B. „Handy – Auflösung“), Freigabe abwarten, dann umsetzen. Kleine Ergänzungen im bestehenden Stil brauchen kein Mockup.
- **Prüfen vor dem Commit:** `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; bei Änderungen an Abläufen oder Layout auch `npm run e2e` (baut selbst, ca. 15 s).
- **Visuell prüfen ohne Spotify:** Abläufe und „ist sichtbar“ per Playwright-Test (`e2e/`, Screenshots dort mit `page.screenshot()`); für einzelne Spielzustände weiterhin die temporäre Seite `src/app/zz-preview/page.tsx`, die Spielzustände mit dem echten Reducer baut; Screenshots mit Headless Brave (`/Applications/Brave Browser.app`, Chrome ist nicht installiert). Handy: 390px-iframes in einer lokalen HTML-Datei (Headless hat eine Mindest-Fensterbreite), Desktop: 1440×900. Keine Seiten mit offenem Event-Stream fotografieren (Headless hängt). Vor dem Commit Vorschauseite und `.next/dev/types` löschen.
- Jeden abgeschlossenen Schritt einzeln committen, Commit-Message auf Englisch im Stil `feat:`/`fix:`/`refactor:` (bis Okt. 2026 deutsch).

## Grundsätze fürs Spiel (aus dem Spieleabend, Okt. 2026)
Gelten für alle Modi – bei jeder Änderung an einem Modus prüfen, ob sie für die anderen genauso gilt, und dort mit umsetzen.
- **Der Server treibt das Spiel voran, nie ein Handy:** Zeitablauf, automatisches Auflösen und Weitermachen laufen per Server-Timer (`deadline`/`scheduleDeadline`, `scheduleContinue`). Handys stoppen Timer im Hintergrund oder gehen offline; ein Spieler in einer anderen App darf nichts aufhalten.
- **Die aktuelle Auswahl zählt:** Was jemand eingestellt oder angetippt hat, geht sofort (als Entwurf) an den Server und zählt bei Zeitablauf. Buttons signalisieren „Fertig“ (früher auflösen), sie sind nicht die einzige Art abzugeben.
- **Automatisch weiter, wenn niemand mehr etwas tun kann** (alle haben geantwortet oder übersprungen) – kein Warten auf einen Klick, der nichts mehr entscheidet.
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
- **Kein SQLite/Persistenz** vorerst: Zustand im Arbeitsspeicher, genau eine Instanz.
- **Playwright-E2E-Tests** gegen den Produktions-Build mit dem Spotify-Simulator als HTTP-Server (`e2e/spotify-server.mts`, Ports 3100/3199, Konfiguration in `playwright.config.ts`). Die App spricht dabei über `SPOTIFY_API_URL`/`SPOTIFY_ACCOUNTS_URL`/`MUSICBRAINZ_URL` mit dem Simulator; der Host meldet sich per Test-Login an, der nur mit `E2E_TEST_LOGIN=1` *und* gesetzter `SPOTIFY_API_URL` existiert (`src/lib/auth.ts`). Läuft in der CI vor dem Docker-Build.
- Standard-Stil ist „Party“ (bunt), „Minimal“ ist umschaltbar.

## Noch nie mit echtem Spotify getestet
Durch Unit-/Render-Tests, Szenarien gegen den Spotify-Simulator (`src/test/spotifySim.ts`) und Screenshots abgedeckt – bei Fehlerberichten zuerst `/diagnose` laufen lassen (prüft Abspielen, Startstelle, Playlists, Warteschlange, Shuffle mit echtem Spotify, je Gerät wählbar) und hier schauen (`src/lib/game/store.ts`: `pollPlayback`, `resumeIfLoaded`):
- Autoplay im Playlist-Modus und bei Zeitstrahl
- Timer starten erst bei tatsächlicher Wiedergabe (`onPlaying`)
- Pause/Play setzt fort statt neu zu starten
- TV verbinden am echten Fernseher-Browser (Abfrage alle 2 s, Zahlentasten der Fernbedienung, QR-Scan mit der Handy-Kamera öffnet `/tv/pair/<code>` im Browser, in dem der Host angemeldet ist)
- Weitermachen per Mehrheit/Vibration am echten Handy (fester Weiter-Button, `navigator.vibrate` nur Android)
- Buzzer: Ausschnittlänge (`schedulePlayLimit` pausiert per Server-Timer); zufällige Startstelle (`position_ms` beim Abspielen über das Album) prüft die Diagnose, im Spiel noch nicht gesehen
- Wiedergabegerät wählen (`/api/game/[id]/devices`: Geräteliste, Übertragen per `PUT /me/player`, `device_id` bei jedem Abspielen; ruhende Geräte per Übertragung wecken + 2 Wiederholversuche in `runEffect`; nach dem Abspielen prüft `ensurePlaying`, ob der Song wirklich läuft, sonst Übertragung mit `play: true` und nochmal abspielen; 403 bei Pause/Fortsetzen gilt als „schon erledigt“)
- Songs werden über ihr Album gestartet (siehe `docs/development.md`, „Notes on the Spotify API“); per Diagnose am Mac bestätigt, im Spiel noch nicht getestet – auch nicht, ob Timer/Ausschnittlänge mit einer anderen Fassung (`sameTrack`) greifen
- Fremde Playlists nachladen: Warteschlange ab Position, Shuffle aus/wieder an und Fortsetzen der vorherigen Musik per Diagnose am Mac bestätigt (Mac startet einen Song zu spät, Shuffle und Play/Pause wirken verzögert – alles im Simulator nachgebildet und ausgeglichen). Nachladen im laufenden Spiel (`loadMoreSongs` vor Start/„Weiter“) noch nicht gesehen; andere Geräte als der Mac noch nicht geprüft
- Helm-Chart: Installation im kind-Cluster der CI lief noch nie (ob die App mit read-only Dateisystem startet, `helm test`, Upgrade); Veröffentlichen als OCI-Chart erst beim ersten Release
- Spotify-Zugang erneuern nach 1 h (`getHostToken`): nur gegen den Simulator getestet
- Lobby-Musik (`/api/game/[id]/music`, Playlist per `context_uri`) und Wiedergabestatus mit Titel in der Lobby (`pollLobbyPlayback`)
- Stöbern nach Jahrzehnt und Genre (Suchfilter `year:`/`genre:`, `src/lib/browse.ts`): die Diagnose prüft es, lief aber noch nie – vor allem, ob die Genre-Namen (`GENRES`) bei Spotify Treffer liefern
- Wie eine App am Handy (Wischen und Zurück-Geste bei Menüs, Startbildschirm-Icon, Vollbild): nur in Chromium (Playwright) und happy-dom getestet, nicht auf echtem iPhone/Android
- Songs des Abends als Playlist speichern (Lobby, `createPlaylist`/`addToPlaylist` in `src/lib/spotify.ts`; spätere Spiele kommen in dieselbe Playlist: `POST /me/playlists`, `POST /playlists/{id}/items`, Berechtigung `playlist-modify-private`): nur gegen den Simulator getestet, die Diagnose prüft es (legt einmal „Kennste?! – Diagnose“ an und nutzt sie wieder). Hosts, die vor der neuen Berechtigung angemeldet waren, müssen sich einmal ab- und wieder anmelden
- Countdown zum Spielstart: Songs lesen und Jahre prüfen während der 5 s (`prepareStart`), Start per Server-Timer – nur gegen den Simulator getestet
- Musik einrichten (`/setup`): Überspringen auf der Startseite, Musik beim Gerätewechsel mitnehmen, Testsong, Gerät wird ins neue Spiel übernommen

## Ausblick: Arbeiten mit Feature-Branches
Aktuell wird direkt auf `main` committet. Später: Feature-Branch → lokal testen → Push + Pull Request (erst der PR startet die CI; aus dem eigenen Repo entsteht ein Test-Image `pr-<Nummer>`) → **Squash and merge** mit PR-Titel im Schema `feat:`/`fix:` (release-please liest nur den Titel, eine Changelog-Zeile pro PR) → Release-PR mergen, wenn released werden soll. Haken: Mit Pflicht-Checks für `main` lässt sich der Release-PR nicht mergen, weil er mit `GITHUB_TOKEN` angelegt wird und keine CI auslöst – entweder Admin-Ausnahme in der Branch-Regel oder release-please ein Token einer GitHub-App geben.

## Offen: Veröffentlichung (Repo ist noch privat)
Vorbereitet ist alles im Repo (README-Hinweis zu den Spotify-Richtlinien, `/api/health`, CI mit Smoke-Test/Trivy/SBOM/cosign, Dependabot, release-please mit erstem Release 1.0.0, `SECURITY.md`). Noch zu tun, in dieser Reihenfolge:
1. **E-Mail in der Historie entscheiden:** Die private E-Mail-Adresse steht in allen Commits. Entweder so lassen, oder vor dem Veröffentlichen per `git filter-repo` durch die GitHub-Noreply-Adresse ersetzen (+ Force-Push; alle Hashes ändern sich → `bootstrap-sha` in `release-please-config.json` auf den neuen Hash des Commits vor „ci: Releases mit release-please“ setzen) und in den GitHub-Einstellungen „Keep my email addresses private“ einschalten. Nicht alles squashen – die Historie zeigt die Arbeitsweise.
2. **Pushen und den ersten CI-Lauf beobachten:** Der Docker-Teil (Smoke-Test, Trivy, SBOM/Provenance, cosign) lief noch nie; Trivy kann an kritischen Lücken stoppen.
3. **GitHub-Einstellungen:** *Actions → General* „Allow GitHub Actions to create and approve pull requests“ (sonst kein Release-PR) · *Code security* „Private vulnerability reporting“ (darauf verweist `SECURITY.md`) · (Branch-Regel für `main` erst mit dem Feature-Branch-Ablauf, siehe „Ausblick“) · Paket `kennste` auf *Public* · *About*: Beschreibung „Self-hosted music quiz for game nights – phones as buzzers, Spotify as the music source“, Topics `music-quiz`, `party-game`, `spotify`, `nextjs`, `self-hosted`, `docker`.
4. **Release-PR 1.0.0 mergen**, dann Repo öffentlich schalten.
5. Danach: Dependabot-PRs für die neuen Hauptversionen der Actions (checkout v7 usw.) einzeln mergen; optional das Node-Basis-Image per Digest festnageln.

## Offen: DevOps-Ausbau (fürs Portfolio)
Erledigt: Helm-Chart (`charts/kennste`), Readiness + sauberes Herunterfahren, CI mit Smoke-Test/Trivy/SBOM/cosign, PR-Images, release-please. Noch zu tun, in dieser Reihenfolge:
1. **Pushen und den CI-Lauf prüfen:** Der Docker-Job gibt jetzt `APP_BUILD` (edge/pr-N + Commit) als Build-Argument mit – prüfen, dass die App bzw. `/api/health` des `edge`-Images die richtige Anzeige hat. Er installiert außerdem das Chart erstmals in kind (startet die App mit read-only Dateisystem? `helm test`, Upgrade). Bei Fehlern zuerst dort schauen; schreibt Next.js woanders hin als `.next/cache` oder `/tmp`, braucht es ein weiteres `emptyDir`.
2. **Observability:** `/metrics` für Prometheus (laufende Spiele, verbundene Clients und TVs, Dauer/Fehler der Spotify-API-Aufrufe, Token-Erneuerungen), `ServiceMonitor` im Chart (abschaltbar), Grafana-Dashboard als JSON im Repo, strukturierte JSON-Logs statt `console.log`.
3. **OpenSSF Scorecard** als Workflow mit Badge; Badges in der README (CI, Release, Scorecard, Lizenz).
4. **ADRs** unter `docs/adr/`: Zustand im Speicher statt Redis (und wie man skalieren würde), Spotify-Simulator statt Mocks, Build ohne Emulation für arm64, Releases mit release-please, ein Pod mit Recreate im Chart.
5. Optional: Kennste?! im eigenen Homelab per GitOps (Argo CD/Flux) mit dem Chart deployen und in der README verlinken; alte `pr-*`-Images automatisch aufräumen.

Bewusst nicht: mehrere Replikas/HPA/Redis „für Hochverfügbarkeit“ (stattdessen als ADR begründen), Terraform ohne echte Cloud-Ressourcen.

## Rückmeldungen vom Spieleabend (Okt. 2026): umgesetzt
Alle Punkte sind umgesetzt (Mockups im Design-Canvas freigegeben). Abweichungen davon: „Songsuche aus einer Playlist“ wurde „Stöbern nach Jahrzehnt und Genre“ (fremde Playlists sind im Development Mode nicht lesbar); bei „Alle gegen alle“ antwortet, wer buzzert, erst laut und sieht dann die Lösung; ein „Richtig“ müssen die anderen per Mehrheit bestätigen (ohne Zeitlimit, Musik läuft weiter), sonst gibt es keinen Punkt. Am echten Spotify noch nicht gesehen: siehe „Noch nie mit echtem Spotify getestet“ – vor allem `/diagnose` für das Stöbern laufen lassen.

## Offen / Ideen
- Zeitstrahl: Token-Regeln (andere Spieler klauen, Bonus für Titel + Interpret)
- Weitere Modus-Ideen: Musik-Bingo, Älter oder neuer?, Chronologie (4 Ausschnitte sortieren), Teams für alle Modi
- Genre-/Jahrzehnt-Filter
- Lyrics am TV (an/aus): Spotify liefert keine Songtexte; möglich wäre LRCLIB (frei, zeitsynchron, ohne Schlüssel). Verraten in fast allen Modi den Song – nur nach der Auflösung oder in der Lobby sinnvoll; rechtlich Grauzone, daher höchstens abschaltbar
- Bekannte Lücke: Der komplette Spielstand (inkl. aktuellem Buzzer-Song) geht an alle Clients – per Entwicklertools lesbar. Betrifft auch die Tipps bei „Jahr schätzen“ und die Antworten bei „Song-Tipp“ (vor der Auflösung abschreibbar; welche Song-Tipp-Antwort richtig ist, bleibt aber auf dem Server). Lösung wären pro Spieler gefilterte Ansichten.
