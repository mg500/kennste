import { defineConfig } from "@playwright/test";

// The images in docs/images (README): `npm run docs:images` plays the game states with the real app against the
// Spotify simulator, with real song names (SIM_CATALOG=docs), and puts the screenshots into device frames.
// Own ports, so a running E2E server (other catalog) is never reused. DOCS_REUSE=1 reuses servers started by hand
// (faster while working on the images; the app must be built from the current code).

const APP = "http://127.0.0.1:3200";
const SIM = "http://127.0.0.1:3299";

export default defineConfig({
  testDir: "scripts/docs-images",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: { baseURL: APP, locale: "de-DE" },
  webServer: [
    {
      command: "node --experimental-strip-types e2e/spotify-server.mts",
      url: `${SIM}/__sim/health`,
      env: { SIM_PORT: "3299", SIM_CATALOG: "docs" },
      reuseExistingServer: !!process.env.DOCS_REUSE,
    },
    {
      command: "npm run build && npx next start -p 3200 -H 127.0.0.1",
      url: APP,
      timeout: 240_000,
      reuseExistingServer: !!process.env.DOCS_REUSE,
      env: {
        SPOTIFY_API_URL: `${SIM}/v1`,
        SPOTIFY_ACCOUNTS_URL: SIM,
        MUSICBRAINZ_URL: `${SIM}/mb`,
        E2E_TEST_LOGIN: "1",
        NEXTAUTH_URL: APP,
        NEXTAUTH_SECRET: "e2e-secret-not-for-production",
        SPOTIFY_CLIENT_ID: "e2e",
        SPOTIFY_CLIENT_SECRET: "e2e",
      },
    },
  ],
});
