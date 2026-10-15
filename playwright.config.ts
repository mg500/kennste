import { defineConfig } from "@playwright/test";

// End-to-end tests: the real app (production build) against the Spotify simulator, with several browsers at
// once (host, players on phones, TV). The app gets a login without Spotify (E2E_TEST_LOGIN, see src/lib/auth.ts).

const APP = "http://127.0.0.1:3100";
const SIM = "http://127.0.0.1:3199";

export default defineConfig({
  testDir: "e2e",
  // One app instance with its games in memory and one simulator: tests run one after another
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: APP, trace: "retain-on-failure", locale: "de-DE" },
  webServer: [
    {
      command: "node --experimental-strip-types e2e/spotify-server.mts",
      url: `${SIM}/__sim/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run build && npx next start -p 3100 -H 127.0.0.1",
      url: APP,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
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
