# Spotify Toolbox

Next.js-App mit zwei Teilen:

- **Erkennst du den Song?** — Multiplayer-Musikquiz. Der Host meldet sich mit Spotify an und erstellt ein Spiel, Mitspieler treten per Link oder Code ohne Login bei. Reihum wählt ein Spieler einen Song (Suche oder Playlist), der auf dem Spotify-Gerät des Hosts läuft; die anderen buzzern, der Spieler am Zug bewertet.
- **Just Playing** — zeigt den aktuell laufenden Spotify-Track des Hosts an.

### Spielfunktionen

- Modi: feste Rundenzahl oder „Best of“ (erster mit N Punkten)
- Songquelle: Spieler wählen selbst oder Playlist (gemischt)
- Tipps (Cover, Titel, Interpret, Jahr), einzeln aktivierbar
- Zeitlimits fürs Antworten und fürs Auflösen, Buzzer pro Runde
- Warteschlange, um schon vor der eigenen Runde Songs vorzumerken
- Zuschauer-Rolle, Spieler entfernen

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
    index.ts         Registry aller Modi
  store.ts           In-Memory-Zustand, Spieler-Tokens, Host-Token-Refresh, Live-Updates, Spotify-Polling
  auth.ts            Token-Prüfung für Route-Handler
  client.ts          Typisierter API-Client für den Browser
  useGameSession.ts  React-Hook: Event-Stream abonnieren, Aktionen senden
src/lib/spotify.ts   Spotify-Web-API-Helfer
src/components/game/
  GameView.tsx       Spiel-UI für alle Rollen (Lobby, Runde, Ergebnis, Host-Menü)
  modes/             UI-Teil der Spielmodi (Runde, Einstellungen, Regeln)
src/app/
  page.tsx           Start: Login, Just Playing, Spiel erstellen/beitreten
  now-playing/       Just Playing
  game/[id]/         Das Spiel – für Host und Mitspieler
```

**Neuen Spielmodus hinzufügen:** `src/lib/game/modes/<modus>.ts` (implementiert `GameMode`), in `modes/index.ts` registrieren und den Datentyp zur `ModeData`-Union hinzufügen; UI unter `src/components/game/modes/<modus>/` (implementiert `ModeUI`) und in `components/game/modes/index.ts` registrieren.

- **Aktionen** laufen alle über `POST /api/game/[id]/action`. Der Reducer prüft, wer was darf (Host, Spieler am Zug, Rater, Zuschauer).
- **Authentifizierung:** Jeder Spieler bekommt beim Beitreten einen geheimen Token (Header `X-Player-Token`, im Browser in `sessionStorage`). Die Spotify-Zugangsdaten des Hosts verlassen nie den Server und werden automatisch erneuert.
- **Live-Updates** per Server-Sent Events (`GET /api/game/[id]/events`): Spielstand und Wiedergabestatus. Spotify wird pro Spiel nur einmal alle 3 s abgefragt, nicht pro Client.
- **Zustand** liegt im Arbeitsspeicher. Es läuft genau eine Instanz; ein Neustart beendet laufende Spiele. Spiele werden nach 2 h Inaktivität gelöscht.

## Spotify API Hinweise

- `/audio-features` ist für neue Apps (erstellt nach Nov. 2024) gesperrt (403).
- `preview_url` ist für neue Apps meist `null` — die Vorschau für Mitspieler greift daher nur selten.
- Playlists: Im Development Mode liefert `/playlists/{id}/items` nur eigene bzw. kollaborative Playlists. Für fremde Playlists liest die App ersatzweise die Wiedergabe-Queue aus (ca. 20 Songs, startet kurz die Wiedergabe).
- Genres werden vom Artist-Endpoint geladen und sind bei vielen Künstlern leer.

## Ideen

- Genre-/Jahrzehnt-Filter (nur Songs aus den 80ern, 90ern, …)
- Einstellbare Vorschau-Dauer (Song läuft nur N Sekunden)
