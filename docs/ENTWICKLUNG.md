# Entwicklung

Technische Notizen zu Kennste?!. Wie man die App einrichtet und startet, steht in der [README](../README.md).

## Funktionen im Detail

- **Musikquiz** mit vier Spielmodi. Der Host meldet sich mit Spotify an und erstellt ein Spiel, Mitspieler treten per QR-Code, Link oder Code ohne Login bei. Die Musik läuft auf dem Spotify-Gerät des Hosts.
  - **Buzzer-Quiz:** Reihum legt ein Spieler einen Song auf (Suche oder Playlist), die anderen buzzern, wer auflegt, bewertet.
  - **Zeitstrahl:** Reihum hört ein Spieler einen unbekannten Song aus der Playlist und ordnet ihn nach Erscheinungsjahr in seinen Zeitstrahl ein. Richtig eingeordnet = Karte gewonnen. Die anderen sehen live, welche Lücke angetippt wird; optional mit Zeitlimit. Spielweise „Gemeinsam“: ein Zeitstrahl fürs ganze Team, die anderen schlagen Lücken vor, jede falsche Karte kostet ein Leben (1–5).
  - **Jahr schätzen:** Ein Song aus der Playlist läuft, alle schätzen gleichzeitig das Erscheinungsjahr (Regler, ±1/±10, Jahrzehnte). Das eingestellte Jahr geht als Entwurf an den Server und zählt, wenn die Zeit um ist; „Fertig“ löst früher auf, sobald alle fertig sind. Exakt 3 Punkte, bis 2 Jahre 2, bis 5 Jahre 1. Die Auflösung zeigt alle Tipps auf einem Zahlenstrahl.
  - **Song-Tipp:** Ein Song aus der Playlist läuft, alle wählen gleichzeitig aus vier Antworten den richtigen Titel oder Interpreten (einstellbar, auch abwechselnd; falsche Antworten aus derselben Playlist). Die erste Antwort zählt; richtig 2 Punkte, wer zuerst richtig liegt +1.
- **Just Playing** — zeigt den gerade laufenden Spotify-Song mit Gerät, Fortschritt und Genres.

- Modi: feste Rundenzahl oder „Best of“ (erster mit N Punkten)
- Songquelle: Spieler wählen selbst oder Playlist (gemischt; Suche nach Name oder Spotify-Link, ohne Suchbegriff die eigenen Playlists)
- Kein Song kommt in einem Spiel doppelt; ist die Playlist durchgespielt, endet das Spiel („Playlist durchgespielt“). Eine Revanche macht mit den noch nicht gespielten Songs weiter
- Tipps (Cover, Titel, Interpret, Jahr), einzeln aktivierbar
- Zeitlimits fürs Antworten und fürs Auflösen, Buzzer pro Runde. Abgelaufene Zeit beendet die Runde der Server selbst (`deadline` im Modus, `scheduleDeadline` in `store.ts`, schickt `timeout` als Host) – Handys stoppen Timer, sobald der Tab im Hintergrund ist. Dabei zählt, was gerade ausgewählt ist (Jahr, angetippte Lücke). Im Buzzer-Quiz löst „Auflösen nach“ den Song auf, ebenso wenn niemand mehr raten kann (alle übersprungen oder keine Buzzer mehr)
- Zufällige Startstelle statt Intro (alle Modi), im Buzzer-Quiz zusätzlich Ausschnittlänge (Song pausiert nach N Sekunden)
- Timer starten erst, wenn Spotify den Song wirklich spielt; Pause/Play setzt fort statt neu zu starten
- Nach der Auflösung macht der Spieler weiter, der als Nächstes dran ist (Host kann im Menü weiterschalten). Sein Weiter-Button steht am Handy fest unten („Du bist dran“, kurze Vibration); die anderen können „Weiter geht's!“ drücken (Taste W, zurücknehmbar; Aktion `voteContinue`, Stimmen in `game.continueVote`). Will mehr als die Hälfte von ihnen weitermachen, läuft für alle ein Countdown von 5 s, danach schaltet der Server selbst weiter (`scheduleContinue` in `store.ts`, als der Spieler, der dran ist). Der sieht, wer weitermachen will, und bekommt eine kurze Vibration; der TV zeigt „Lea will weitermachen“ und den Countdown
- Warteschlange, um schon vor der eigenen Runde Songs vorzumerken; die Songsuche lädt beim Scrollen weitere Ergebnisse (10 pro Seite, `offset`) und behält Suchbegriff und Auswahl pro Spiel und Spieler (`localStorage`), auch wenn zwischendurch eine Runde startet
- Zuschauer-Rolle, Spieler entfernen
- Musik einrichten vor dem Spiel (`/setup`): erklärt, dass alle in einem Raum spielen, zeigt was wo läuft, Gerät wählen und Testsong abspielen; wird übersprungen, wenn auf einem steuerbaren Gerät schon Musik läuft
- Wiedergabegerät wählen (Spotify Connect): beim Einrichten, in der Lobby oder während des Spiels im Spielmenü des Hosts; „Automatisch“ nutzt das gerade aktive Gerät
- Lobby: Der Host stellt in einer Karte ein, was gespielt wird (Modus, Spiellänge per Voreinstellung, Songs: Spieler oder Playlist – eine fehlende Playlist steht dort und unter „Spiel starten“; „Alle Regeln“ für den Rest), verwaltet Spieler per Tipp auf ihren Chip (zuschauen lassen, entfernen) und lädt über den Code oben ein (QR-Code, Link, TV-Ansicht; am Laptop immer sichtbar). Mitspieler sehen nur, was gespielt wird, wer dabei ist und auf wen sie warten (`GameLobby.tsx`, `LobbyGame.tsx`)
- Musik in der Lobby (Zeile des Hosts, `LobbyMusic.tsx`): was gerade läuft (Play/Pause), hinter „…“ Gerät, „Musik abspielen“ (Song oder Playlist suchen, `POST /api/game/[id]/music`). In der Lobby enthält der Wiedergabestatus Titel und Cover, im Spiel nicht (würde den Song verraten)
- TV-Lobby zeigt „Läuft gerade“; der Host kann den TV im Musik-Menü auf eine Vollbildansicht davon umschalten (`screenView`)
- Host kann ein laufendes Spiel abbrechen: alle bleiben in der Lobby, Punkte werden zurückgesetzt, die Musik stoppt
- Laptop/PC-Layout ab 1024 px Breite mit Tastaturkürzeln (Buzzer: Leertaste buzzern, S überspringen, P Play/Pause, 1–4 Tipps, R/F bewerten, A auflösen; Zeitstrahl: ←/→ Lücke wählen, Enter einordnen, N anderer Song; Enter = Weiter, W = „Weiter geht's!“)
- TV-Ansicht für TV/Beamer (`/game/<code>/screen`): ohne Beitritt über „TV-Ansicht“ beim Code-Feld, in der Lobby oder automatisch angeboten für Zuschauer am großen Bildschirm; die Lobby zeigt an, wenn eine TV-Ansicht verbunden ist
- TV verbinden ohne Tippen (`/tv`): Der TV zeigt einen 4-stelligen Kopplungscode und einen QR-Code (gilt 10 Minuten, erneuert sich selbst, einmal verwendbar). Der Host gibt ihn in der Lobby oder im Spielmenü unter „TV verbinden“ ein (`POST /api/game/[id]/screen`, Spieler-Token) oder scannt den QR-Code (`/tv/pair/<code>`, erkannt an der Spotify-Anmeldung über `/api/tv/pair`). Der TV fragt alle 2 s nach (`/api/tv/<screenId>`, geheime Kennung statt Code) und springt ins Spiel; nach dem Spiel zurück auf `/tv` (Merker in `sessionStorage`). Max. 10 falsche Codes pro Spiel und Minute, max. 100 offene Codes (`src/lib/game/pairing.ts`)
- Zuschauen am Handy ohne Beitritt: dieselbe Seite zeigt unter 1024 px ein Handy-Layout (Lobby mit „Mitspielen“, laufende Runde mit Punktestand, Spielende); auf dem Handy heißen die Einstiege „Zuschauen“, und diese Zuschauer zählen nicht als verbundene TV-Ansicht

## Lokal starten

Wie im README eine Spotify-App anlegen, aber mit der Redirect URI `http://127.0.0.1:3000/api/auth/callback/spotify`. Dann:

```bash
cp .env.example .env.local    # NEXTAUTH_URL=http://127.0.0.1:3000
npm install
npm run dev
```

App unter [http://127.0.0.1:3000](http://127.0.0.1:3000) öffnen – Spotify erlaubt `localhost` nicht mehr (`src/proxy.ts` leitet um). Mitspieler im selben WLAN öffnen `http://<IP-des-Rechners>:3000` und geben den Spielcode ein; der QR-Code zeigt lokal auf `127.0.0.1`.

## Tests

Welche Art Test wofür, und die Regeln dazu, steht in der `AGENTS.md` („Tests“). Die Bausteine:

- **Unit-Tests** für die Spiellogik: Reducer und Modi sind reine Funktionen, Tests bauen Spielzustände mit `applyAction`.
- **Render-Tests** (`renderToStaticMarkup`): was jede Rolle sieht.
- **happy-dom-Tests** mit Testing Library: Klicks, Timer (`vi.useFakeTimers`), Event-Stream (nachgebautes `EventSource`).
- **Spotify-Simulator** (Fake mit Zustand statt einzelner Mocks) und **Szenario-Tests** für ganze Abläufe.
- **Spotify-Diagnose** als Gegenprobe am echten Spotify (Contract-Test, manuell, weil sie ein Konto und ein laufendes Gerät braucht).
- **Playwright** (`e2e/`): die echte App (Produktions-Build) in Chromium mit mehreren Browsern gleichzeitig – Host am Handy, Mitspieler, TV – gegen den Simulator als HTTP-Server (`e2e/spotify-server.mts`). Die App bekommt dafür andere Adressen (`SPOTIFY_API_URL`, `SPOTIFY_ACCOUNTS_URL`, `MUSICBRAINZ_URL`) und einen Test-Login statt Spotify (nur mit `E2E_TEST_LOGIN=1` und gesetzter `SPOTIFY_API_URL`). Erster Lauf: `npx playwright install chromium`.

## Befehle

```bash
npm test        # Vitest: Spiellogik, API-Rechte, Live-Updates, UI-Rendering, Abläufe gegen den Spotify-Simulator,
                # Browser-Code mit happy-dom (Datei beginnt mit `// @vitest-environment happy-dom`)
npm run e2e      # Playwright: Abläufe im Browser gegen den Spotify-Simulator (baut die App selbst)
npm run lint
npx next typegen && npx tsc --noEmit
```

**Spotify-Simulator** (`src/test/spotifySim.ts`): bildet die genutzte Web-API mit Zustand nach (Katalog, eigene/fremde Playlists, Geräte inkl. ruhender, Wiedergabe mit Album-/Playlist-Kontext, ablaufende Zugänge samt Token-Erneuerung, Queue mit Autoplay nach dem Ende, Shuffle; mit `lag` wirken Shuffle und Play/Pause wie bei den echten Apps verzögert). Szenario-Tests in `src/lib/game/scenarios.test.ts` spielen damit ganze Abläufe durch; `timing.scale = 0` (`src/lib/spotify.ts`) schaltet die Wartezeiten ab. Wie sich das echte Spotify verhält, zeigt nur die Diagnose:

**Spotify-Diagnose** (`/diagnose`, angemeldet, `src/lib/diagnose.ts`): prüft per Klick mit dem eigenen Konto und einem wählbaren Gerät, was das Spiel von Spotify erwartet – Song über das Album starten (mit Meldezeit), an bestimmter Stelle starten, Pause/Fortsetzen, eigene Playlist lesen, Warteschlange ab Position 21 mit Shuffle (Reihenfolge gegen die Playlist verglichen), Shuffle und vorherige Musik danach wiederhergestellt, fremde Playlist blockweise lesen. Spielt kurz Musik und stellt danach den vorherigen Zustand her. Die Diagnose selbst ist gegen den Simulator getestet.

## Architektur

```
src/lib/game/
  types.ts           Gemeinsame Typen für Client und Server (Game, Action, GameEvent, …)
  reducer.ts         Kern-Spiellogik: Lobby, Rollen, Reihenfolge, Spielziel, Playlist, Wiedergabe
  modes/             Spielmodi (reine Logik): eigene Einstellungen, Rundenzustand, Aktionen
    buzzer.ts        Buzzer-Quiz
    timeline.ts      Zeitstrahl
    year.ts          Jahr schätzen (alle gleichzeitig: `simultaneous`)
    choice.ts        Song-Tipp (alle gleichzeitig)
    index.ts         Registry aller Modi
  store.ts           In-Memory-Zustand, Spieler-Tokens, Host-Token-Refresh, Live-Updates, Spotify-Polling
  auth.ts            Token-Prüfung für Route-Handler
  pairing.ts         TV verbinden: Kopplungscodes, Begrenzung der Fehlversuche
  client.ts          Typisierter API-Client für den Browser
  useGameSession.ts  React-Hook: Event-Stream abonnieren, Aktionen senden
src/lib/spotify.ts   Spotify-Web-API-Helfer
src/components/game/
  GameView.tsx       Spiel-UI für alle Rollen (Lobby, Runde, Ergebnis, Host-Menü)
  GameLobby.tsx      Lobby (LobbyGame.tsx: Modus, Regeln, Songs; LobbyMusic.tsx: Musik-Zeile)
  Watch.tsx          Zuschauen am Handy ohne Beitritt (TV-Ansicht-Seite unter 1024 px)
  modes/             UI-Teil der Spielmodi (Runde, Einstellungen, Regeln)
src/components/MusicSetup.tsx  „Musik einrichten“ (nutzt /api/spotify/player, /search, /play)
src/app/
  page.tsx           Start: Login, Just Playing, Spiel erstellen/beitreten
  now-playing/       Just Playing
  setup/             Musik einrichten vor dem Spiel (Gerät, Testsong)
  game/[id]/         Das Spiel – für Host und Mitspieler
  tv/                Fernseher verbinden (Kopplungscode) und tv/pair/[code] nach dem QR-Scan
```

**Neuen Spielmodus hinzufügen:** `src/lib/game/modes/<modus>.ts` (implementiert `GameMode`), in `modes/index.ts` registrieren und den Datentyp zur `ModeData`-Union hinzufügen; UI unter `src/components/game/modes/<modus>/` (implementiert `ModeUI`: Runde, TV-Ansicht, Zuschauen am Handy, Einstellungen, Regeln) und in `components/game/modes/index.ts` registrieren.

- **Aktionen** laufen alle über `POST /api/game/[id]/action`. Der Reducer prüft, wer was darf (Host, Spieler am Zug, Rater, Zuschauer).
- **Authentifizierung:** Jeder Spieler bekommt beim Beitreten einen geheimen Token (Header `X-Player-Token`, im Browser in `sessionStorage`). Die Spotify-Zugangsdaten des Hosts verlassen nie den Server und werden automatisch erneuert.
- **Live-Updates** per Server-Sent Events (`GET /api/game/[id]/events`): Spielstand und Wiedergabestatus. Spotify wird pro Spiel nur einmal alle 3 s abgefragt, nicht pro Client.
- **Docker-Image** (amd64 + arm64): Abhängigkeiten und Build laufen nativ auf der Plattform des Build-Rechners, für arm64 wird das Ergebnis nur kopiert (keine Emulation). Das geht, weil der Build bis auf `sharp` reines JavaScript ist; `sharp` (Bildoptimierung für `next/image`) wird im Dockerfile entfernt, `images.unoptimized` ist gesetzt. **`next/image` deshalb nicht verwenden** – oder vorher das Dockerfile anpassen.
- **Health-Checks und Herunterfahren:** `/api/health` (Liveness: der Server antwortet, mit Version) und `/api/health/ready` (Readiness: 503, sobald er herunterfährt). Bei SIGTERM/SIGINT wartet Next.js auf offene Anfragen – die Event-Streams enden aber nie von selbst, der Container hinge bis zum SIGKILL. `src/instrumentation.ts` registriert deshalb `beginShutdown` (`src/lib/lifecycle.ts`), das alle Streams schließt; die Browser verbinden sich selbst neu. Gemessen: Beenden mit offenem Stream 0,02 s statt Hängen bis zum SIGKILL. Laufende Spiele gehen beim Neustart verloren (Zustand im Speicher).
- **CI/CD** (`.github/workflows/ci.yml`): Lint, Typecheck, Unit- und E2E-Tests; nur wenn alles grün ist, baut der Docker-Job das Image, startet es testweise (Smoke-Test: Healthcheck muss „healthy“ werden), scannt es mit Trivy (kritische Lücken mit verfügbarem Fix stoppen) und veröffentlicht es mit SBOM und Provenance, signiert mit cosign (keyless). Actions sind auf Commit-SHAs festgenagelt; Dependabot (`.github/dependabot.yml`) schlägt wöchentlich Updates für npm, Actions und das Node-Image vor. Workflows prüfen: [`actionlint`](https://github.com/rhysd/actionlint).
- **Helm-Chart** (`charts/kennste`): fest ein Pod mit `strategy: Recreate` (Zustand im Speicher), Startup-/Liveness-/Readiness-Probes, ohne Root und mit read-only Dateisystem (`emptyDir` für `.next/cache` und `/tmp`), Secret wird erzeugt (Session-Secret bleibt über Upgrades) oder per `existingSecret` übernommen, Ingress-Annotations für Server-Sent Events, `values.schema.json` gegen Tippfehler. README per [`helm-docs`](https://github.com/norwoodj/helm-docs) aus den Kommentaren in `values.yaml` (`README.md.gotmpl`) – nach Änderungen neu erzeugen, die CI prüft es. CI: `helm lint --strict`, `kubeconform`, und das frisch gebaute Image wird in einem kind-Cluster per Chart installiert (`helm test`, Upgrade). Bei einem Release erhöht release-please `version`/`appVersion` im `Chart.yaml`, das Chart geht als OCI-Artefakt nach `ghcr.io/mg500/charts/kennste` und wird mit cosign signiert.
- **Test-Images für Pull Requests:** Jeder PR baut das Image ebenfalls und prüft es (Smoke-Test, Trivy). PRs aus diesem Repo veröffentlichen es als `ghcr.io/mg500/kennste:pr-<Nummer>` (signiert), um einen Branch vor dem Merge auf dem Server auszuprobieren; `edge`, `latest` und die Versionen bleiben unberührt. PRs aus Forks und von Dependabot haben nur Leserechte und veröffentlichen nichts. Alte `pr-*`-Images räumt noch niemand auf (bei Bedarf in den Paket-Einstellungen löschen).
- **Releases** mit [release-please](https://github.com/googleapis/release-please): Aus `feat:`/`fix:`-Commits pflegt es einen Release-Pull-Request mit Version und `CHANGELOG.md` (`feat` → Minor, `fix` → Patch, `!`/`BREAKING CHANGE` → Major; `refactor`, `test`, `docs`, `ci`, `chore` erscheinen nicht). Wer ihn merged, erzeugt Tag, GitHub-Release und die Image-Tags `1.2.3`, `1.2`, `1` und `latest`; jeder andere Commit auf `main` landet als `edge`. Eine bestimmte Version erzwingen: `Release-As: 2.0.0` in den Commit-Text. Einmalig nötig: unter *Settings → Actions → General* „Allow GitHub Actions to create and approve pull requests“ einschalten. Der Release-PR selbst löst keine CI aus (von `GITHUB_TOKEN` erstellt) – er ändert nur Version und Changelog.
- **Zustand** liegt im Arbeitsspeicher. Es läuft genau eine Instanz; ein Neustart beendet laufende Spiele. Spiele werden nach 2 h Inaktivität gelöscht.

## Spotify-API-Hinweise

- `/audio-features` ist für neue Apps (erstellt nach Nov. 2024) gesperrt (403).
- `preview_url` ist für neue Apps meist `null` — die Vorschau für Mitspieler greift daher nur selten.
- Playlists: Im Development Mode liefert `/playlists/{id}/items` nur eigene bzw. kollaborative Playlists. Fremde Playlists liest die App über die Wiedergabe-Queue aus: Playlist ab Position N starten, Queue lesen (aktueller Song + 20), pausieren; Shuffle ist dabei aus. Beim Auswählen wird ein Block ab zufälliger Stelle gelesen, beim Spielstart bis 30 ungespielte Songs da sind und vor jedem „Weiter“, wenn weniger als 3 übrig sind (`loadMoreSongs` in `store.ts`, `src/lib/playlists.ts`). Die Musik am Gerät setzt dabei kurz aus. Die Spotify-Apps übernehmen Shuffle und melden Play/Pause erst einen Moment nach dem Befehl (per Diagnose am Mac gesehen) – daher wartet die App per `waitForPlayer`, bis Shuffle wirklich aus ist, und prüft nach dem Start der Playlist nochmal. Außerdem startet die Mac-App eine Playlist einen Song nach der angeforderten Position (obwohl der Song abspielbar ist): Die Blöcke überlappen deshalb um einen Song (`BLOCK_STRIDE`), und am Playlist-Ende wird ein Song weniger übernommen, damit kein Autoplay-Song ins Spiel rutscht – höchstens der erste oder letzte Song der Playlist bleibt ungenutzt.
- Abspielen: Die Spotify-Apps (Mac, Handy, TV) nehmen einen einzelnen Song per `uris` mit 204 an, spielen dann aber nichts (Stand Okt. 2026, nur der Web Player spielt ihn). Songs werden deshalb über ihr Album gestartet (`context_uri` + `offset`); die App spielt dabei teils eine andere Fassung (z. B. ohne „Remastered“), die über den normalisierten Titel als derselbe Song gilt (`sameTrack`). Nach dem Song läuft das Album weiter.
- Genres werden vom Artist-Endpoint geladen und sind bei vielen Künstlern leer.
- **Erscheinungsjahre:** Spotifys Album-Datum ist oft ein Remaster (2011 statt 1975). Der Server ermittelt das Jahr der Erstveröffentlichung über [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) – per ISRC, ersatzweise per Suche (frühestes Jahr unter den Treffern mit gleichem Titel *und* Interpret). MusicBrainz erlaubt 1 Anfrage/s, für Playlists läuft das daher im Hintergrund, aktuelle und nächste Songs zuerst (`enrichYears`); eine Runde wartet trotzdem bis zu 5 s, bis ihr Song geprüft ist (`verifyUpcoming`, beim Start auch für die Startkarten). Selbst ausgesuchte Songs (Buzzer-Quiz) werden nach dem Abspielen geprüft, die Runde bekommt das korrigierte Jahr über `trackUpdated`. Kann MusicBrainz nicht antworten (offline, 503 bei zu vielen Anfragen), gilt das Jahr nicht als geprüft und wird später nochmal angefragt (bis 3 Durchgänge im Abstand von 30 s). Optional `MUSICBRAINZ_CONTACT` setzen (Kontakt im User-Agent).

## Ideen

- Genre-/Jahrzehnt-Filter (nur Songs aus den 80ern, 90ern, …)
- Zeitstrahl: Token-Regeln (andere Spieler können „klauen“, Bonus für Titel + Interpret)
