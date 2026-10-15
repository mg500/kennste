<div align="center">

# Kennste?!

**Hör hin. Rate mit.**

Das Musikquiz für gesellige Runden. Hört gemeinsam Musik, ratet mit und nutzt eure Handys als Buzzer.

<img src="docs/images/hero.png" alt="Kennste?! auf dem Fernseher mit QR-Code zum Beitreten, daneben zwei Handys: eins mit großem Buzzer, eins mit „Tom hat gebuzzert! – Richtig oder Falsch“" width="100%">

</div>

## So funktioniert's

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/images/step-1.png" alt="Startseite nach dem Login mit den vier Spielen" width="220"></td>
    <td align="center" width="33%"><img src="docs/images/step-2.png" alt="Lobby mit QR-Code, Spielcode und Spielerliste" width="220"></td>
    <td align="center" width="33%"><img src="docs/images/step-3.png" alt="Runde auf dem Handy mit großem Buzzer" width="220"></td>
  </tr>
  <tr>
    <td valign="top"><b>1. Spiel starten</b><br>Wer die Musik mitbringt, meldet sich mit Spotify an und wählt ein Spiel.</td>
    <td valign="top"><b>2. Alle rein</b><br>Die anderen scannen den QR-Code oder geben den Code ein – ohne App und ohne Account.</td>
    <td valign="top"><b>3. Hören und raten</b><br>Die Musik kommt für alle aus einem Lautsprecher, die Handys sind Buzzer, Tippzettel und Zeitstrahl.</td>
  </tr>
</table>

Ihr sitzt zusammen in einem Raum. Wer mag, holt die **TV-Ansicht** auf Fernseher oder Beamer – dort laufen Runde, Countdown und Punktestand für alle sichtbar mit.

## Die Spiele

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/mode-buzzer.png" alt="Buzzer-Quiz: TV zeigt „Tom hat gebuzzert!“, Handy den Buzzer">
      <h3>Buzzer-Quiz</h3>
      Reihum legt jemand einen Song auf – per Suche oder aus einer Playlist. Wer ihn zuerst erkennt, buzzert, und wer aufgelegt hat, entscheidet: richtig oder falsch? Für Profis mit kurzen Ausschnitten und zufälliger Startstelle statt Intro.
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/mode-timeline.png" alt="Zeitstrahl: Karten mit Jahreszahlen, eine Lücke ist markiert">
      <h3>Zeitstrahl</h3>
      Ein unbekannter Song läuft – aber wann kam er raus? Ordne ihn in deinen Zeitstrahl ein. Liegst du richtig, behältst du die Karte. Oder spielt <i>gemeinsam</i>: ein Zeitstrahl fürs ganze Team, jede falsche Karte kostet ein Leben.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/mode-year.png" alt="Jahr schätzen: Handy mit Jahreszahl 1990 und Regler">
      <h3>Jahr schätzen</h3>
      Alle tippen gleichzeitig das Erscheinungsjahr. Volltreffer gibt 3 Punkte, bis 2 Jahre daneben 2, bis 5 Jahre 1. Die Auflösung zeigt alle Tipps auf einem Zahlenstrahl.
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/mode-choice.png" alt="Song-Tipp: vier Antworten zur Auswahl">
      <h3>Song-Tipp</h3>
      Vier Antworten, eine stimmt: Wie heißt der Song, wer singt ihn? Wer richtig liegt, punktet – wer als Erstes richtig liegt, bekommt einen Bonus.
    </td>
  </tr>
</table>

**Und außerdem:** feste Rundenzahl oder „Wer zuerst N Punkte hat“ · Songs selbst aussuchen oder aus einer Playlist · zuschaltbare Tipps (Cover, Titel, Interpret, Jahr) · Zeitlimits · Zuschauen ohne Mitspielen · Laptop-Ansicht mit Tastaturkürzeln · zwei Stile: bunt („Party“) oder schlicht („Minimal“) · **Just Playing** zeigt nebenbei, was gerade auf deinem Spotify läuft.

## Was du brauchst

- **Spotify Premium** für den Host – nur sein Konto steuert die Musik.
- **Ein Gerät mit Spotify** für die Musik: Laptop, Box, Fernseher, …
- **Einen Server mit Docker**, auf dem Kennste?! läuft – zu Hause oder im Netz.
- **Mitspieler** brauchen nur ein Handy mit Browser.

> [!NOTE]
> **Warum selbst betreiben?** Spotify erlaubt Apps wie dieser ohne gesonderte Freigabe nur bis zu **5 eingetragene Nutzer** („Development Mode“). Du legst dir deshalb eine eigene, kostenlose Spotify-App an und trägst dich dort ein. Mitspieler melden sich nicht an und zählen nicht dazu.

## Loslegen

**1. Spotify-App anlegen**

Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) auf *Create app* klicken:
- *Redirect URI:* die Adresse deines Servers plus `/api/auth/callback/spotify`, z. B. `https://kennste.example.de/api/auth/callback/spotify`
- *Which API/SDKs are you planning to use?* → **Web API**
- Danach unter *User Management* dein Spotify-Konto eintragen (und das aller weiteren Hosts).

> [!IMPORTANT]
> Spotify verlangt für die Anmeldung **HTTPS**. Die einzige Ausnahme ist `http://127.0.0.1`.

**2. Starten**

```bash
git clone <repo-url> kennste && cd kennste
cp .env.example .env                              # Client ID, Secret und Adresse eintragen
cp docker-compose.example.yml docker-compose.yml
docker compose up -d
```

`NEXTAUTH_URL` in der `.env` ist dieselbe Adresse wie oben, ohne `/api/…`.

**3. Spielen**

Adresse öffnen, mit Spotify anmelden, Spiel erstellen – die anderen scannen den QR-Code.

## Gut zu wissen

- **Die Musik startet nicht?** Spiel auf dem gewünschten Gerät kurz selbst einen Song in Spotify an. Ruhende Geräte reagieren sonst manchmal nicht. Kennste?! hilft dabei mit dem Schritt „Musik einrichten“ vor dem Spiel.
- **Nach einem Song läuft das Album weiter.** Spotifys Apps spielen einzelne Songs per Fernsteuerung derzeit nicht zuverlässig ab, deshalb startet Kennste?! sie über ihr Album.
- **Alles läuft im Arbeitsspeicher.** Ein Neustart des Servers beendet laufende Spiele.
- **Fair Play:** Wer die Entwicklertools des Browsers öffnet, kann den Spielstand mitlesen – für ein Partyspiel unter Freunden in Ordnung.

## Mitmachen

Lokal entwickeln, Architektur, Tests und Hinweise zur Spotify-API: siehe [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md).

## Lizenz

[MIT](LICENSE). Kennste?! ist ein privates Projekt und steht in keiner Verbindung zu Spotify.
