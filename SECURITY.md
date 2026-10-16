# Sicherheit

## Lücke melden

Bitte **nicht** als öffentliches Issue, sondern privat über GitHub: *Security → Report a vulnerability* in diesem Repository. Ich melde mich, sobald ich es gesehen habe – es ist ein Hobbyprojekt, also ohne feste Fristen.

*Please report vulnerabilities privately via “Security → Report a vulnerability”, not as a public issue.*

## Unterstützte Versionen

Nur die jeweils neueste Version (`ghcr.io/mg500/kennste:latest`) bekommt Korrekturen.

## Bekannt und bewusst so

- **Der Spielstand ist für alle Mitspieler lesbar.** Wer die Entwicklertools des Browsers öffnet, sieht z. B. den aktuellen Song im Buzzer-Quiz oder die Tipps der anderen. Für ein Partyspiel unter Freunden ist das in Ordnung; pro Spieler gefilterte Ansichten wären die Lösung.
- **Alles liegt im Arbeitsspeicher** einer einzigen Instanz, auch die Spotify-Zugangsdaten des Hosts. Sie verlassen den Server nicht und verschwinden mit dem Spiel.
- **Wer den Spielcode kennt, kann beitreten.** Der Host kann Spieler in der Lobby entfernen.

## Was das Projekt tut

- Abhängigkeiten, GitHub Actions und das Node-Image hält Dependabot aktuell; Actions sind auf Commit-SHAs festgenagelt.
- Jedes Image wird vor dem Veröffentlichen mit [Trivy](https://trivy.dev) gescannt, kommt mit SBOM und Provenance und ist mit [cosign](https://docs.sigstore.dev) signiert:

  ```bash
  cosign verify ghcr.io/mg500/kennste:latest \
    --certificate-identity-regexp 'https://github.com/mg500/kennste/' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com
  ```
- Der Container läuft ohne Root-Rechte.
