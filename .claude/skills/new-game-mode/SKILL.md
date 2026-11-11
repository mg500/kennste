---
name: new-game-mode
description: Checkliste für einen neuen Spielmodus oder eine neue Variante in Kennste?! – Logik, UI, Registrierung, Grundsätze und Tests auf jeder Ebene. Verwenden, wenn ein Modus oder eine Variante dazukommt oder ein bestehender Modus grundlegend umgebaut wird.
---

# Neuer Spielmodus

Der technische Ablauf steht in `docs/development.md` („Adding a game mode“). Diese Checkliste ergänzt, was dort nicht steht. Vorher die Grundsätze und „Gestaltung“ in `AGENTS.md` lesen.

## 0. Variante oder eigener Modus?
Eine Variante ist ein bestehender Modus mit festgelegten Einstellungen (`modes/groups.ts`). Reicht das, keinen neuen Modus bauen.

## 1. Mockup
Neuer Modus = eigene Seite im Design-Canvas (Handy, Laptop, TV), Freigabe abwarten (siehe `AGENTS.md`, „Neue Layouts/Screens“).

## 2. Logik (`src/lib/game/modes/<mode>.ts`, implementiert `GameMode`)
- In `modes/index.ts` registrieren (`MODES`, `ModeData`, `ModeAction`) und in `modes/groups.ts` anbieten.
- `view`: Was darf welches Gerät vor der Auflösung sehen? Song über `mask`, fremde Tipps entfernen, „wer hat geantwortet“ als Platzhalter behalten.
- `deadline` für Zeitablauf und automatisches Weiter – der Server treibt das Spiel, nie ein Handy.
- Entwürfe: Auswahl geht sofort an den Server und zählt bei Zeitablauf; „Fertig“ löst nur früher auf.
- Automatisch auflösen, sobald niemand mehr etwas tun kann.
- `simultaneous`, `requiresPlaylist`, `startCards` (Jahre der Startkarten vorab prüfen) passend setzen.
- Verlauf per `turn.record` schreiben und in `awards.ts` festlegen, welche Auszeichnungen der Modus vergibt.

## 3. UI (`src/components/game/modes/<mode>/`, implementiert `ModeUI`)
- `Round` (Handy, alle Rollen), `Screen`/`ScreenWide` (TV), `Watch` (Zuschauen am Handy), `Settings`, `Rules`, `summary`.
- Einstellungen über die gemeinsamen Zeilen in `modes/settingRows.tsx` in fester Reihenfolge (prüft `GameLobby.test.tsx`).
- TV zeigt den Stand jedes Spielers während der Runde und alle Antworten mit Punkten danach (`playerCards: true` bei „alle gleichzeitig“).
- Tastenkürzel am Laptop wie in den anderen Modi (Enter = weiter, W = „Weiter geht's!“).
- Farben nach der Auflösung: richtig = `positive` + ✓, eigene falsche Wahl = Buzzer-Farbe + ✗, nie `primary`.
- Timer und Zähler mit `TimerDigits`/`tabular-nums`.
- In `components/game/modes/index.ts` registrieren.

## 4. Tests (im selben Commit)
- Unit-Test `modes/<mode>.test.ts`: Ablauf, Punkte, Zeitablauf mit Entwurf, automatisches Auflösen, `view` verrät nichts.
- Render-Test `components/game/modes/<mode>/…test.tsx`: was Spieler, Host, TV und Zuschauer sehen, vor und nach der Auflösung.
- happy-dom-Test für Entwürfe, die Neuladen überstehen.
- Szenario in `scenarios.test.ts`, wenn der Modus Spotify anders nutzt (Startstelle, Nachladen).
- E2E nur, wenn ein neuer Ablauf über mehrere Geräte dazukommt (`e2e/round.spec.ts` als Vorbild).

## 5. Abschluss
- `docs/development.md` (Funktionen, Architektur) und `README.md` + `README.de.md` ergänzen.
- `npm run check`, `npm run e2e`.
