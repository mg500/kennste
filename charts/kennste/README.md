# kennste

Self-hosted music quiz for game nights – phones as buzzers, Spotify as the music source

![Version: 0.1.0](https://img.shields.io/badge/Version-0.1.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 0.1.0](https://img.shields.io/badge/AppVersion-0.1.0-informational?style=flat-square)

## Install

```bash
helm install kennste oci://ghcr.io/mg500/charts/kennste \
  --namespace kennste --create-namespace \
  --set url=https://kennste.example.com \
  --set spotify.clientId=... --set spotify.clientSecret=... \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set 'ingress.tls[0].secretName=kennste-tls' --set 'ingress.tls[0].hosts[0]=kennste.example.com'
```

Create the Spotify app as described in the [project's README](https://github.com/mg500/kennste#getting-started), with the redirect URI `<url>/api/auth/callback/spotify`. Instead of credentials in the values, an existing Secret works too (`existingSecret`, e.g. from External Secrets or Sealed Secrets).

The chart is signed with [cosign](https://docs.sigstore.dev):

```bash
cosign verify ghcr.io/mg500/charts/kennste:<version> \
  --certificate-identity-regexp 'https://github.com/mg500/kennste/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Good to know

- **Exactly one pod.** Every game lives in memory. A second pod would split the games, so there's no `replicaCount`, and updates use `strategy: Recreate`. A restart or upgrade ends running games – best not in the middle of a game night.
- **Live updates via server-sent events.** The ingress must not buffer them and has to keep the connection open; the default annotations take care of that for ingress-nginx, Traefik needs nothing.
- **Health checks:** liveness `/api/health`, readiness `/api/health/ready` (503 as soon as the pod shuts down). On shutdown, the app closes its event streams right away; the browsers reconnect by themselves.
- **Security:** runs without root, with a read-only file system, without capabilities and without a service account token. `helm test` checks that the app is ready.

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
