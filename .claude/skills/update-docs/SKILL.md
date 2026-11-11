---
name: update-docs
description: Doku von Kennste?! mit dem Code abgleichen und die README-Bilder neu erzeugen – README/README.de.md, docs/development.md, docs/spotify-verification.md, AGENTS.md, Skills. Verwenden nach Änderungen an Oberfläche, Spielen, Varianten, Einstellungen oder Befehlen, vor einem Release, oder wenn jemand sagt, die Doku oder die Bilder seien veraltet.
---

# Doku aktualisieren

## 1. Was hat sich geändert?
Seit dem letzten Doku-Commit: `git log --oneline -- README.md docs/ | head -1`, dann `git log --oneline <hash>..` und `git diff --stat <hash>..`. Daraus ableiten, welche Abschnitte betroffen sind – nicht jede Datei Zeile für Zeile neu schreiben.

## 2. Texte abgleichen
Jede Aussage, die betroffen sein kann, gegen den Code prüfen:
- **README.md + README.de.md** (immer beide, gleicher Inhalt): Spiele und Varianten wie in `src/lib/game/modes/groups.ts` (Namen, Reihenfolge, Beschreibung), Punkte und Regeln aus den Modi, „Also:“-Liste, „What you need“, Einrichtung (Umgebungsvariablen wie in `.env.example`, `docker-compose.example.yml`).
- **docs/development.md:** „Features in detail“, Architektur-Baum (gibt es die Dateien noch? `ls`), „Commands“ (wie in `package.json`), Spotify-Hinweise, Ideen (umgesetzte streichen).
- **docs/spotify-verification.md:** Neues, das nur gegen den Simulator getestet ist, ergänzen; Bestätigtes umschreiben.
- **AGENTS.md und `.claude/skills/`:** Dateinamen, Funktionen und Befehle, die erwähnt werden, existieren noch (`grep`).
- Verweise auf Abschnitte (`#notes-on-the-spotify-api` usw.) zeigen auf vorhandene Überschriften.

Sprache: README, docs und Skills-Beschreibungen nach den Regeln in `AGENTS.md` („Sprachen im Repo“); UI-Begriffe auf Deutsch in Anführungszeichen, mit Übersetzung, wo es hilft.

## 3. Bilder neu erzeugen
```bash
npm run docs:images
```
Baut die App, startet den Simulator mit echten Songtiteln (`scripts/docs-images/songs.ts`) auf eigenen Ports (3200/3299), spielt die Zustände in `scripts/docs-images/images.spec.ts` an und schreibt `docs/images/*.png` (Rohbilder in `test-results/docs-images/`). Zum Feilen an einem Bild: Server einmal von Hand starten (Befehle in `playwright.docs.config.ts`) und `DOCS_REUSE=1 npx playwright test -c playwright.docs.config.ts -g "<Test>"`.

- **Schlägt ein Schritt fehl,** hat sich meist ein Text oder Button geändert: Locator anpassen, nicht den Zustand weglassen.
- **Neues Spiel oder neue Variante:** Test in `images.spec.ts` ergänzen und das Bild in beiden READMEs einbauen.
- **Jedes Bild ansehen** (Read-Tool): Zeigt es, was der Text daneben verspricht? Nichts abgeschnitten, keine leeren Cover, kein Splash/Countdown mitten im Bild?
- **Alt-Texte** in beiden READMEs an das anpassen, was das Bild wirklich zeigt.
- Stil der Bilder: „Bühne“ (der Standard). Die Farbe des Bühnenlichts aus dem Cover fehlt in den Bildern (der Server lädt Cover von `i.scdn.co`, im Test nicht erreichbar) – das ist so gewollt.

## 4. Abschluss
- `npm run check`; bei Änderungen am Simulator-Server auch `npm run e2e`.
- Commit mit `docs:`, Bilder und Texte zusammen.
