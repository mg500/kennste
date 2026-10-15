# Spotify Toolbox

Next.js-App mit zwei Teilen:

- **Musikquiz** mit vier Spielmodi. Der Host meldet sich mit Spotify an und erstellt ein Spiel, Mitspieler treten per QR-Code, Link oder Code ohne Login bei. Die Musik läuft auf dem Spotify-Gerät des Hosts.
  - **Buzzer-Quiz:** Reihum legt ein Spieler einen Song auf (Suche oder Playlist), die anderen buzzern, wer auflegt, bewertet.
  - **Hitster:** Reihum hört ein Spieler einen unbekannten Song aus der Playlist und ordnet ihn nach Erscheinungsjahr in seinen Zeitstrahl ein. Richtig eingeordnet = Karte gewonnen. Die anderen sehen live, welche Lücke angetippt wird; optional mit Zeitlimit. Spielweise „Gemeinsam“: ein Zeitstrahl fürs ganze Team, die anderen schlagen Lücken vor, jede falsche Karte kostet ein Leben (1–5).
  - **Jahr schätzen:** Ein Song aus der Playlist läuft, alle schätzen gleichzeitig das Erscheinungsjahr (Regler, ±1/±10, Jahrzehnte). Aufgelöst wird, wenn alle getippt haben oder die Zeit um ist; exakt 3 Punkte, bis 2 Jahre 2, bis 5 Jahre 1. Die Auflösung zeigt alle Tipps auf einem Zahlenstrahl.
  - **Song-Tipp:** Ein Song aus der Playlist läuft, alle wählen gleichzeitig aus vier Antworten den richtigen Titel oder Interpreten (einstellbar, auch abwechselnd; falsche Antworten aus derselben Playlist). Die erste Antwort zählt; richtig 2 Punkte, wer zuerst richtig liegt +1.
- **Just Playing** — zeigt den aktuell laufenden Spotify-Track des Hosts an.

### Spielfunktionen

- Modi: feste Rundenzahl oder „Best of“ (erster mit N Punkten)
- Songquelle: Spieler wählen selbst oder Playlist (gemischt)
- Tipps (Cover, Titel, Interpret, Jahr), einzeln aktivierbar
- Zeitlimits fürs Antworten und fürs Auflösen, Buzzer pro Runde
- Buzzer-Quiz: Ausschnittlänge (Song pausiert nach N Sekunden) und zufällige Startstelle statt Intro
- Timer starten erst, wenn Spotify den Song wirklich spielt; Pause/Play setzt fort statt neu zu starten
- Nach der Auflösung macht der Spieler weiter, der als Nächstes dran ist (Host kann im Menü weiterschalten)
- Warteschlange, um schon vor der eigenen Runde Songs vorzumerken
- Zuschauer-Rolle, Spieler entfernen
- Wiedergabegerät wählen (Spotify Connect): in der Lobby oder während des Spiels im Spielmenü des Hosts; „Automatisch“ nutzt das gerade aktive Gerät
- Host kann ein laufendes Spiel abbrechen: alle bleiben in der Lobby, Punkte werden zurückgesetzt, die Musik stoppt
- Laptop/PC-Layout ab 1024 px Breite mit Tastaturkürzeln (Buzzer: Leertaste buzzern, S überspringen, P Play/Pause, 1–4 Tipps, R/F bewerten, A auflösen; Hitster: ←/→ Lücke wählen, Enter einordnen, N anderer Song; Enter = Weiter)
- TV-Ansicht für TV/Beamer (`/game/<code>/screen`): ohne Beitritt über „TV-Ansicht“ beim Code-Feld, in der Lobby oder automatisch angeboten für Zuschauer am großen Bildschirm; die Lobby zeigt an, wenn eine TV-Ansicht verbunden ist
- Zuschauen am Handy ohne Beitritt: dieselbe Seite zeigt unter 1024 px ein Handy-Layout (Lobby mit „Mitspielen“, laufende Runde mit Punktestand, Spielende); auf dem Handy heißen die Einstiege „Zuschauen“, und diese Zuschauer zählen nicht als verbundene TV-Ansicht

## Setup

### 1. Spotify App anlegen

Unter [developer.spotify.com](https://developer.spotify.com) eine neue App erstellen und folgenden Redirect URI eintragen:

```
http://127.0.0.1:3000/api/auth/callback/spotify
```

> **Hinweis:** `localhost` ist seit April 2025 von Spotify nicht mehr erlaubt — es muss `127.0.0.1` verwendet werden.

Im Development Mode müssen alle Hosts in der Spotify-App als Nutzer eingetragen sein. Mitspieler brauchen keinen Spotify-Account.

### 2. Umgebungsvariablen

`.env.local` anlegen:

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://127.0.0.1:3000
```

### 3. Starten

```bash
npm install
npm run dev
```

App unter [http://127.0.0.1:3000](http://127.0.0.1:3000) öffnen (nicht `localhost`). Für den Host muss Spotify auf irgendeinem Gerät aktiv sein.

## Entwicklung

```bash
npm test        # Vitest: Spiellogik, API-Rechte, Live-Updates, UI-Rendering
npm run lint
npx next typegen && npx tsc --noEmit
```

### Architektur

```
src/lib/game/
  types.ts           Gemeinsame Typen für Client und Server (Game, Action, GameEvent, …)
  reducer.ts         Kern-Spiellogik: Lobby, Rollen, Reihenfolge, Spielziel, Playlist, Wiedergabe
  modes/             Spielmodi (reine Logik): eigene Einstellungen, Rundenzustand, Aktionen
    buzzer.ts        Buzzer-Quiz
    hitster.ts       Hitster
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
src/app/
  page.tsx           Start: Login, Just Playing, Spiel erstellen/beitreten
  now-playing/       Just Playing
  game/[id]/         Das Spiel – für Host und Mitspieler
```

**Neuen Spielmodus hinzufügen:** `src/lib/game/modes/<modus>.ts` (implementiert `GameMode`), in `modes/index.ts` registrieren und den Datentyp zur `ModeData`-Union hinzufügen; UI unter `src/components/game/modes/<modus>/` (implementiert `ModeUI`: Runde, TV-Ansicht, Zuschauen am Handy, Einstellungen, Regeln) und in `components/game/modes/index.ts` registrieren.

- **Aktionen** laufen alle über `POST /api/game/[id]/action`. Der Reducer prüft, wer was darf (Host, Spieler am Zug, Rater, Zuschauer).
- **Authentifizierung:** Jeder Spieler bekommt beim Beitreten einen geheimen Token (Header `X-Player-Token`, im Browser in `sessionStorage`). Die Spotify-Zugangsdaten des Hosts verlassen nie den Server und werden automatisch erneuert.
- **Live-Updates** per Server-Sent Events (`GET /api/game/[id]/events`): Spielstand und Wiedergabestatus. Spotify wird pro Spiel nur einmal alle 3 s abgefragt, nicht pro Client.
- **Zustand** liegt im Arbeitsspeicher. Es läuft genau eine Instanz; ein Neustart beendet laufende Spiele. Spiele werden nach 2 h Inaktivität gelöscht.

## Spotify API Hinweise

- `/audio-features` ist für neue Apps (erstellt nach Nov. 2024) gesperrt (403).
- `preview_url` ist für neue Apps meist `null` — die Vorschau für Mitspieler greift daher nur selten.
- Playlists: Im Development Mode liefert `/playlists/{id}/items` nur eigene bzw. kollaborative Playlists. Für fremde Playlists liest die App ersatzweise die Wiedergabe-Queue aus (ca. 20 Songs, startet kurz die Wiedergabe).
- Genres werden vom Artist-Endpoint geladen und sind bei vielen Künstlern leer.
- **Erscheinungsjahre:** Spotifys Album-Datum ist oft ein Remaster (2011 statt 1975). Für Playlists ermittelt der Server das Jahr der Erstveröffentlichung über [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) – per ISRC, ersatzweise per Suche (frühestes Jahr). MusicBrainz erlaubt 1 Anfrage/s, die Auflösung läuft daher im Hintergrund, aktuelle und nächste Songs zuerst. Optional `MUSICBRAINZ_CONTACT` setzen (Kontakt im User-Agent).

## Ideen

- Genre-/Jahrzehnt-Filter (nur Songs aus den 80ern, 90ern, …)
- Hitster: Token-Regeln (andere Spieler können „klauen“, Bonus für Titel + Interpret)
