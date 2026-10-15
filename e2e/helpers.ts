import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const SIM = "http://127.0.0.1:3199";

/** Phones (players, host at the table), a TV and a laptop. */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const TV = { viewport: { width: 1440, height: 810 } };
const LAPTOP = { viewport: { width: 1440, height: 900 } };

export async function resetSpotify() {
  await fetch(`${SIM}/__sim/reset`, { method: "POST" });
}

/** Something plays on the host's Spotify, as before a game night. */
export async function playOnSpotify(trackId: string) {
  await fetch(`${SIM}/v1/me/player/play?device_id=wohnzimmer`, {
    method: "PUT", headers: { Authorization: "Bearer token" }, body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
  });
}

export async function spotifyPlayer(): Promise<{ current: string | null; isPlaying: boolean; deviceId: string | null }> {
  return (await fetch(`${SIM}/__sim/player`)).json();
}

export const phone = (browser: Browser) => browser.newContext(PHONE);
/** A small phone (iPhone SE): long content doesn't fit on the screen. */
export const smallPhone = (browser: Browser) => browser.newContext({ ...PHONE, viewport: { width: 375, height: 667 } });
export const tv = (browser: Browser) => browser.newContext(TV);
export const laptop = (browser: Browser) => browser.newContext(LAPTOP);

/** Logs the host in (test login instead of Spotify) and creates a game in the given mode; returns the code. */
export async function hostGame(context: BrowserContext, mode: string): Promise<{ page: Page; code: string }> {
  const { csrfToken } = await (await context.request.get("/api/auth/csrf")).json();
  await context.request.post("/api/auth/callback/e2e", { form: { csrfToken, json: "true" } });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: mode }).click();
  await page.waitForURL(/\/game\/\w+$/);
  return { page, code: page.url().split("/").at(-1)! };
}

/** A player joins on their phone with the code. */
export async function join(context: BrowserContext, code: string, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/game/${code}`);
  await page.getByLabel("Dein Name").fill(name);
  await page.getByRole("button", { name: "Mitspielen" }).click();
  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
  return page;
}
