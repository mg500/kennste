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
