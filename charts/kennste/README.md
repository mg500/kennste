# kennste

Self-hosted Musikquiz für Spieleabende – Handys als Buzzer, Spotify als Musikquelle

![Version: 0.1.0](https://img.shields.io/badge/Version-0.1.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 0.1.0](https://img.shields.io/badge/AppVersion-0.1.0-informational?style=flat-square)

## Installieren

```bash
helm install kennste oci://ghcr.io/mg500/charts/kennste \
  --namespace kennste --create-namespace \
  --set url=https://kennste.example.de \
  --set spotify.clientId=... --set spotify.clientSecret=... \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set 'ingress.tls[0].secretName=kennste-tls' --set 'ingress.tls[0].hosts[0]=kennste.example.de'
```

Die Spotify-App legst du wie in der [README des Projekts](https://github.com/mg500/kennste#loslegen) beschrieben an; als Redirect URI `<url>/api/auth/callback/spotify`. Statt Zugangsdaten in den Werten geht auch ein bestehendes Secret (`existingSecret`, z. B. aus External Secrets oder Sealed Secrets).

Das Chart ist mit [cosign](https://docs.sigstore.dev) signiert:

```bash
cosign verify ghcr.io/mg500/charts/kennste:<version> \
  --certificate-identity-regexp 'https://github.com/mg500/kennste/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Gut zu wissen

- **Genau ein Pod.** Alle Spiele liegen im Arbeitsspeicher. Ein zweiter Pod würde die Spiele aufteilen, deshalb gibt es kein `replicaCount`, und Updates laufen mit `strategy: Recreate`. Ein Neustart oder Upgrade beendet laufende Spiele – am besten nicht mitten im Spieleabend.
- **Live-Updates per Server-Sent Events.** Der Ingress darf sie nicht puffern und muss die Verbindung offen halten; die Standard-Annotations erledigen das für ingress-nginx, Traefik braucht nichts.
- **Health-Checks:** Liveness `/api/health`, Readiness `/api/health/ready` (503, sobald der Pod herunterfährt). Beim Beenden schließt die App ihre Event-Streams sofort, die Browser verbinden sich selbst neu.
- **Sicherheit:** läuft ohne Root, mit read-only Dateisystem, ohne Capabilities und ohne Service-Account-Token. `helm test` prüft, ob die App bereit ist.

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` |  |
| existingSecret | string | `""` | Use an existing Secret instead (keys: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `NEXTAUTH_SECRET`); `spotify.*` and `nextauthSecret` are ignored then |
| extraEnv | list | `[]` | Further environment variables for the container |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.repository | string | `"ghcr.io/mg500/kennste"` | Container image |
| image.tag | string | `""` | Image tag; empty: the chart's appVersion |
| imagePullSecrets | list | `[]` | Pull secrets, e.g. for a private registry |
| ingress.annotations | object | `{"nginx.ingress.kubernetes.io/proxy-buffering":"off","nginx.ingress.kubernetes.io/proxy-read-timeout":"3600","nginx.ingress.kubernetes.io/proxy-send-timeout":"3600"}` | The game's live updates are server-sent events: proxies must not buffer them and must keep the connection open. Set for ingress-nginx; Traefik needs nothing. |
| ingress.className | string | `""` | Ingress class, e.g. `nginx` or `traefik` |
| ingress.enabled | bool | `false` |  |
| ingress.host | string | `""` | Host name; empty: the host of `url` |
| ingress.tls | list | `[]` | TLS, e.g. `[{secretName: kennste-tls, hosts: [kennste.example.de]}]` |
| musicbrainzContact | string | `""` | Contact (URL or e-mail) sent to MusicBrainz, which looks up original release years |
| nextauthSecret | string | `""` | Secret for session cookies (any random string, e.g. `openssl rand -base64 32`). Empty: one is generated on install and kept on upgrades |
| nodeSelector | object | `{}` |  |
| podAnnotations | object | `{}` |  |
| podLabels | object | `{}` |  |
| podSecurityContext.fsGroup | int | `1001` |  |
| podSecurityContext.runAsGroup | int | `1001` |  |
| podSecurityContext.runAsNonRoot | bool | `true` |  |
| podSecurityContext.runAsUser | int | `1001` |  |
| podSecurityContext.seccompProfile.type | string | `"RuntimeDefault"` |  |
| resources | object | `{"limits":{"memory":"512Mi"},"requests":{"cpu":"50m","memory":"128Mi"}}` | CPU and memory. One game night needs little; memory grows with loaded playlists |
| securityContext.allowPrivilegeEscalation | bool | `false` |  |
| securityContext.capabilities.drop[0] | string | `"ALL"` |  |
| securityContext.readOnlyRootFilesystem | bool | `true` |  |
| service.port | int | `80` |  |
| service.type | string | `"ClusterIP"` |  |
| spotify.clientId | string | `""` | Client ID of your app in the Spotify Developer Dashboard |
| spotify.clientSecret | string | `""` | Client secret of that app |
| terminationGracePeriodSeconds | int | `15` | Time to finish open requests on shutdown; the event streams are closed right away |
| tolerations | list | `[]` |  |
| url | string | `"https://kennste.example.de"` | Public address of the app (HTTPS, Spotify requires it). Also the Redirect URI in the Spotify Developer Dashboard: `<url>/api/auth/callback/spotify` |
