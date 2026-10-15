# Entwicklung

Technische Notizen zu Kennste?!. Wie man die App einrichtet und startet, steht in der [README](../README.md).

## Funktionen im Detail

- **Musikquiz** mit vier Spielmodi. Der Host meldet sich mit Spotify an und erstellt ein Spiel, Mitspieler treten per QR-Code, Link oder Code ohne Login bei. Die Musik läuft auf dem Spotify-Gerät des Hosts.
  - **Buzzer-Quiz:** Reihum legt ein Spieler einen Song auf (Suche oder Playlist), die anderen buzzern, wer auflegt, bewertet.
  - **Zeitstrahl:** Reihum hört ein Spieler einen unbekannten Song aus der Playlist und ordnet ihn nach Erscheinungsjahr in seinen Zeitstrahl ein. Richtig eingeordnet = Karte gewonnen. Die anderen sehen live, welche Lücke angetippt wird; optional mit Zeitlimit. Spielweise „Gemeinsam“: ein Zeitstrahl fürs ganze Team, die anderen schlagen Lücken vor, jede falsche Karte kostet ein Leben (1–5).
  - **Jahr schätzen:** Ein Song aus der Playlist läuft, alle schätzen gleichzeitig das Erscheinungsjahr (Regler, ±1/±10, Jahrzehnte). Aufgelöst wird, wenn alle getippt haben oder die Zeit um ist; exakt 3 Punkte, bis 2 Jahre 2, bis 5 Jahre 1. Die Auflösung zeigt alle Tipps auf einem Zahlenstrahl.
  - **Song-Tipp:** Ein Song aus der Playlist läuft, alle wählen gleichzeitig aus vier Antworten den richtigen Titel oder Interpreten (einstellbar, auch abwechselnd; falsche Antworten aus derselben Playlist). Die erste Antwort zählt; richtig 2 Punkte, wer zuerst richtig liegt +1.
- **Just Playing** — zeigt den gerade laufenden Spotify-Song mit Gerät, Fortschritt und Genres.

- Modi: feste Rundenzahl oder „Best of“ (erster mit N Punkten)
- Songquelle: Spieler wählen selbst oder Playlist (gemischt; Suche nach Name oder Spotify-Link, ohne Suchbegriff die eigenen Playlists)
- Kein Song kommt in einem Spiel doppelt; ist die Playlist durchgespielt, endet das Spiel („Playlist durchgespielt“). Eine Revanche macht mit den noch nicht gespielten Songs weiter
- Tipps (Cover, Titel, Interpret, Jahr), einzeln aktivierbar
- Zeitlimits fürs Antworten und fürs Auflösen, Buzzer pro Runde
- Zufällige Startstelle statt Intro (alle Modi), im Buzzer-Quiz zusätzlich Ausschnittlänge (Song pausiert nach N Sekunden)
- Timer starten erst, wenn Spotify den Song wirklich spielt; Pause/Play setzt fort statt neu zu starten
- Nach der Auflösung macht der Spieler weiter, der als Nächstes dran ist (Host kann im Menü weiterschalten). Sein Weiter-Button steht am Handy fest unten („Du bist dran“, kurze Vibration); die anderen können ihn mit Skip oder Flamme anstupsen – als Sprechblasen bei ihm und auf dem TV (flüchtige `reaction`-Events, `POST /api/game/[id]/react`, max. eine pro Spieler alle 2,5 s)
- Warteschlange, um schon vor der eigenen Runde Songs vorzumerken
- Zuschauer-Rolle, Spieler entfernen
- Musik einrichten vor dem Spiel (`/setup`): erklärt, dass alle in einem Raum spielen, zeigt was wo läuft, Gerät wählen und Testsong abspielen; wird übersprungen, wenn auf einem steuerbaren Gerät schon Musik läuft
- Wiedergabegerät wählen (Spotify Connect): beim Einrichten, in der Lobby oder während des Spiels im Spielmenü des Hosts; „Automatisch“ nutzt das gerade aktive Gerät
- Musik in der Lobby (Karte „Musik“ des Hosts): Gerät, was gerade läuft (Play/Pause), „Musik abspielen“ (Song oder Playlist suchen, `POST /api/game/[id]/music`). In der Lobby enthält der Wiedergabestatus Titel und Cover, im Spiel nicht (würde den Song verraten)
- TV-Lobby zeigt „Läuft gerade“; der Host kann den TV auf eine Vollbildansicht davon umschalten (`screenView`)
- Host kann ein laufendes Spiel abbrechen: alle bleiben in der Lobby, Punkte werden zurückgesetzt, die Musik stoppt
- Laptop/PC-Layout ab 1024 px Breite mit Tastaturkürzeln (Buzzer: Leertaste buzzern, S überspringen, P Play/Pause, 1–4 Tipps, R/F bewerten, A auflösen; Zeitstrahl: ←/→ Lücke wählen, Enter einordnen, N anderer Song; Enter = Weiter)
- TV-Ansicht für TV/Beamer (`/game/<code>/screen`): ohne Beitritt über „TV-Ansicht“ beim Code-Feld, in der Lobby oder automatisch angeboten für Zuschauer am großen Bildschirm; die Lobby zeigt an, wenn eine TV-Ansicht verbunden ist
- Zuschauen am Handy ohne Beitritt: dieselbe Seite zeigt unter 1024 px ein Handy-Layout (Lobby mit „Mitspielen“, laufende Runde mit Punktestand, Spielende); auf dem Handy heißen die Einstiege „Zuschauen“, und diese Zuschauer zählen nicht als verbundene TV-Ansicht

## Lokal starten

Wie im README eine Spotify-App anlegen, aber mit der Redirect URI `http://127.0.0.1:3000/api/auth/callback/spotify`. Dann:

```bash
cp .env.example .env.local    # NEXTAUTH_URL=http://127.0.0.1:3000
npm install
npm run dev
```

App unter [http://127.0.0.1:3000](http://127.0.0.1:3000) öffnen – Spotify erlaubt `localhost` nicht mehr (`src/proxy.ts` leitet um). Mitspieler im selben WLAN öffnen `http://<IP-des-Rechners>:3000` und geben den Spielcode ein; der QR-Code zeigt lokal auf `127.0.0.1`.

## Befehle

```bash
npm test        # Vitest: Spiellogik, API-Rechte, Live-Updates, UI-Rendering, Abläufe gegen den Spotify-Simulator,
                # Browser-Code mit happy-dom (Datei beginnt mit `// @vitest-environment happy-dom`)
npm run lint
npx next typegen && npx tsc --noEmit
```

**Spotify-Simulator** (`src/test/spotifySim.ts`): bildet die genutzte Web-API mit Zustand nach (Katalog, eigene/fremde Playlists, Geräte inkl. ruhender, Wiedergabe mit Album-/Playlist-Kontext, Queue mit Autoplay nach dem Ende, Shuffle). Szenario-Tests in `src/lib/game/scenarios.test.ts` spielen damit ganze Abläufe durch; `timing.scale = 0` (`src/lib/spotify.ts`) schaltet die Wartezeiten ab. Wie sich das echte Spotify verhält, zeigt nur die Diagnose:

**Spotify-Diagnose** (`/diagnose`, angemeldet, `src/lib/diagnose.ts`): prüft per Klick mit dem eigenen Konto und aktiven Gerät, was das Spiel von Spotify erwartet – Song über das Album starten, Pause/Fortsetzen, eigene Playlist lesen, Warteschlange ab Position 21 mit Shuffle (Reihenfolge gegen die Playlist verglichen), Shuffle und vorherige Musik danach wiederhergestellt, fremde Playlist blockweise lesen. Spielt kurz Musik und stellt danach den vorherigen Zustand her. Die Diagnose selbst ist gegen den Simulator getestet.

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
  client.ts          Typisierter API-Client für den Browser
  useGameSession.ts  React-Hook: Event-Stream abonnieren, Aktionen senden
src/lib/spotify.ts   Spotify-Web-API-Helfer
src/components/game/
  GameView.tsx       Spiel-UI für alle Rollen (Lobby, Runde, Ergebnis, Host-Menü)
  Watch.tsx          Zuschauen am Handy ohne Beitritt (TV-Ansicht-Seite unter 1024 px)
  modes/             UI-Teil der Spielmodi (Runde, Einstellungen, Regeln)
src/components/MusicSetup.tsx  „Musik einrichten“ (nutzt /api/spotify/player, /search, /play)
src/app/
  page.tsx           Start: Login, Just Playing, Spiel erstellen/beitreten
  now-playing/       Just Playing
  setup/             Musik einrichten vor dem Spiel (Gerät, Testsong)
  game/[id]/         Das Spiel – für Host und Mitspieler
```

**Neuen Spielmodus hinzufügen:** `src/lib/game/modes/<modus>.ts` (implementiert `GameMode`), in `modes/index.ts` registrieren und den Datentyp zur `ModeData`-Union hinzufügen; UI unter `src/components/game/modes/<modus>/` (implementiert `ModeUI`: Runde, TV-Ansicht, Zuschauen am Handy, Einstellungen, Regeln) und in `components/game/modes/index.ts` registrieren.

- **Aktionen** laufen alle über `POST /api/game/[id]/action`. Der Reducer prüft, wer was darf (Host, Spieler am Zug, Rater, Zuschauer).
- **Authentifizierung:** Jeder Spieler bekommt beim Beitreten einen geheimen Token (Header `X-Player-Token`, im Browser in `sessionStorage`). Die Spotify-Zugangsdaten des Hosts verlassen nie den Server und werden automatisch erneuert.
- **Live-Updates** per Server-Sent Events (`GET /api/game/[id]/events`): Spielstand und Wiedergabestatus. Spotify wird pro Spiel nur einmal alle 3 s abgefragt, nicht pro Client.
- **Zustand** liegt im Arbeitsspeicher. Es läuft genau eine Instanz; ein Neustart beendet laufende Spiele. Spiele werden nach 2 h Inaktivität gelöscht.

## Spotify-API-Hinweise

- `/audio-features` ist für neue Apps (erstellt nach Nov. 2024) gesperrt (403).
- `preview_url` ist für neue Apps meist `null` — die Vorschau für Mitspieler greift daher nur selten.
- Playlists: Im Development Mode liefert `/playlists/{id}/items` nur eigene bzw. kollaborative Playlists. Fremde Playlists liest die App über die Wiedergabe-Queue aus: Playlist ab Position N starten, Queue lesen (aktueller Song + 20), pausieren; Shuffle ist dabei aus. Beim Auswählen wird ein Block ab zufälliger Stelle gelesen, beim Spielstart bis 30 ungespielte Songs da sind und vor jedem „Weiter“, wenn weniger als 3 übrig sind (`loadMoreSongs` in `store.ts`, `src/lib/playlists.ts`). Die Musik am Gerät setzt dabei kurz aus.
- Abspielen: Die Spotify-Apps (Mac, Handy, TV) nehmen einen einzelnen Song per `uris` mit 204 an, spielen dann aber nichts (Stand Okt. 2026, nur der Web Player spielt ihn). Songs werden deshalb über ihr Album gestartet (`context_uri` + `offset`); die App spielt dabei teils eine andere Fassung (z. B. ohne „Remastered“), die über den normalisierten Titel als derselbe Song gilt (`sameTrack`). Nach dem Song läuft das Album weiter.
- Genres werden vom Artist-Endpoint geladen und sind bei vielen Künstlern leer.
- **Erscheinungsjahre:** Spotifys Album-Datum ist oft ein Remaster (2011 statt 1975). Für Playlists ermittelt der Server das Jahr der Erstveröffentlichung über [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) – per ISRC, ersatzweise per Suche (frühestes Jahr). MusicBrainz erlaubt 1 Anfrage/s, die Auflösung läuft daher im Hintergrund, aktuelle und nächste Songs zuerst. Optional `MUSICBRAINZ_CONTACT` setzen (Kontakt im User-Agent).

## Ideen

- Genre-/Jahrzehnt-Filter (nur Songs aus den 80ern, 90ern, …)
- Zeitstrahl: Token-Regeln (andere Spieler können „klauen“, Bonus für Titel + Interpret)
