# Security

## Reporting a vulnerability

Please **don't** open a public issue – report it privately via GitHub: *Security → Report a vulnerability* in this repository. I'll get back to you as soon as I've seen it; it's a hobby project, so there are no fixed deadlines.

## Supported versions

Only the newest version (`ghcr.io/mg500/kennste:latest`) gets fixes.

## Known and intended

- **The game state is readable by every player.** Anyone who opens the browser's developer tools can see, for example, the current song in the buzzer quiz or the other players' guesses. That's fine for a party game among friends; views filtered per player would be the fix.
- **Everything lives in the memory** of a single instance, including the host's Spotify credentials. They never leave the server and disappear with the game.
- **Anyone who knows the game code can join.** The host can remove players in the lobby.

## What the project does

- Dependabot keeps dependencies, GitHub Actions and the Node image up to date; actions are pinned to commit SHAs.
- Every image is scanned with [Trivy](https://trivy.dev) before it's published, comes with an SBOM and provenance, and is signed with [cosign](https://docs.sigstore.dev):

  ```bash
  cosign verify ghcr.io/mg500/kennste:latest \
    --certificate-identity-regexp 'https://github.com/mg500/kennste/' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com
  ```
- The container runs without root privileges.
