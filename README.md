# Spotify Playground

Next.js app that zeigt den aktuell gespielten Spotify-Track an.

## Features

- Spotify OAuth Login (via next-auth)
- Aktuell laufender Track mit Album-Cover
- Fortschrittsbalken (live, sekündlich aktualisiert)
- Popularität als Balken
- Erscheinungsjahr, Album-Typ (Album / Single / Compilation)
- Track-Position (z.B. Track 3 / 12)
- Explicit-Badge
- Genres (sofern von Spotify bereitgestellt)

## Setup

### 1. Spotify App anlegen

Unter [developer.spotify.com](https://developer.spotify.com) eine neue App erstellen und folgenden Redirect URI eintragen:

```
http://127.0.0.1:3000/api/auth/callback/spotify
```

> **Hinweis:** `localhost` ist seit April 2025 von Spotify nicht mehr erlaubt — es muss `127.0.0.1` verwendet werden.

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

App unter [http://127.0.0.1:3000](http://127.0.0.1:3000) öffnen (nicht `localhost`).

## Spotify API Hinweise

- `/audio-features` ist für neue Apps (erstellt nach Nov. 2024) gesperrt (403) — BPM, Energie etc. sind daher nicht verfügbar.
- Genres werden vom Artist-Endpoint geladen und sind bei vielen Künstlern leer.
- Benötigte Scopes: `user-read-currently-playing`, `user-read-playback-state`
---
Hast du noch ideen für die spiel einstellungen?                                                                                                                           

⏺ Ein paar Ideen die gut passen würden:

  Einfach umzusetzen:
  - Tipp-Erlaubnis — Host kann Cover/Titel/Interpret/Jahr-Tipps komplett deaktivieren
  - Punkte pro Runde — statt immer 1 Punkt, z.B. 2 oder 3 konfigurierbar
  - Spieler-Reihenfolge — reihum (aktuell) oder zufällig

  Etwas aufwändiger:
  - Zeitlimit zum Erraten — z.B. 30 Sekunden nach dem Buzz, danach automatisch "Falsch"
  - Max. Buzzer pro Runde — wie viele Spieler buzzern dürfen bevor aufgelöst wird
  - Vorschau-Dauer — Song wird nach X Sekunden automatisch pausiert (5s, 15s, 30s, unbegrenzt)

  Größere Features:
  - Playlist-Filter — Songs müssen aus einer bestimmten Spotify-Playlist kommen
  - Genre/Jahrzehnt-Filter — nur Songs aus einem bestimmten Jahrzehnt (80er, 90er, …)

  Die naheliegendsten wären meiner Meinung nach Tipp-Erlaubnis (passt direkt ins bestehende System) und Vorschau-Dauer (macht das Spiel deutlich schwieriger oder leichter).
   Was interessiert dich?