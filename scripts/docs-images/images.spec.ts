import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { join } from "../../e2e/helpers";
import { compose, type Shot } from "./compose";
import { DOCS_SONGS } from "./songs";

// Plays the game states shown in the README with the real app (see playwright.docs.config.ts) and writes
// docs/images. Raw screenshots go to test-results/docs-images first, then compose() puts them into device frames.

const SIM = "http://127.0.0.1:3299";
const RAW = path.join("test-results", "docs-images");
const OUT = path.join("docs", "images");
const PLAYERS = ["Lea", "Tom", "Ben"];

test.describe.configure({ mode: "serial" });
test.beforeAll(() => mkdirSync(RAW, { recursive: true }));
// Music already plays on the host's Spotify, as before a game night (otherwise the app opens "Musik einrichten")
test.beforeEach(async () => {
  await fetch(`${SIM}/__sim/reset`, { method: "POST" });
  await fetch(`${SIM}/v1/me/player/play?device_id=wohnzimmer`, {
    method: "PUT", headers: { Authorization: "Bearer token" }, body: JSON.stringify({ uris: ["spotify:track:t39"] }),
  });
});

/** A cover in the song's color, as the browser would load it from Spotify's image server. */
function cover(trackId: string): string {
  const color = DOCS_SONGS[Number(trackId.slice(1))]?.[3] ?? "#71717a";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".55"/></linearGradient></defs>
    <rect width="64" height="64" fill="#18181b"/><rect width="64" height="64" fill="url(#g)"/>
    <circle cx="44" cy="22" r="12" fill="#fff" fill-opacity=".22"/></svg>`;
}

async function device(browser: Browser, options: Parameters<Browser["newContext"]>[0]): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await context.route("https://i.scdn.co/image/*", route =>
    route.fulfill({ contentType: "image/svg+xml", body: cover(route.request().url().split("/").at(-1)!) }));
  return context;
}
const phone = (browser: Browser) =>
  device(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const tv = (browser: Browser) => device(browser, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

/** Waits until animations (splash, countdown, fades) are over and takes a screenshot of the visible screen. */
async function shot(page: Page, name: string, wait = 1200): Promise<Shot> {
  await page.waitForTimeout(wait);
  const file = path.join(RAW, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  return { file, ...page.viewportSize()! };
}

async function login(context: BrowserContext): Promise<Page> {
  const { csrfToken } = await (await context.request.get("/api/auth/csrf")).json();
  await context.request.post("/api/auth/callback/e2e", { form: { csrfToken, json: "true" } });
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

async function create(page: Page, game: string, variant?: string): Promise<string> {
  await page.getByRole("button", { name: new RegExp(`^${game}`) }).click();
  await page.waitForURL(/\/game\/\w+$/);
  if (variant) {
    const radio = page.getByRole("radio", { name: new RegExp(`^${variant}`) });
    await radio.click();
    await expect(radio).toHaveAttribute("aria-checked", "true");
  }
  return page.url().split("/").at(-1)!;
}

/** Host, TV and three players in one game. */
async function table(browser: Browser, game: string, variant?: string) {
  const host = await login(await phone(browser));
  const code = await create(host, game, variant);
  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  const players: Record<string, Page> = {};
  for (const name of PLAYERS) players[name] = await join(await phone(browser), code, name);
  return { host, screen, code, ...players } as { host: Page; screen: Page; code: string; Lea: Page; Tom: Page; Ben: Page };
}

async function pickPlaylist(host: Page) {
  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  const songs = host.getByRole("dialog", { name: "Songs" });
  await songs.getByRole("button", { name: /Eigene Playlists/ }).click();
  await songs.getByRole("button", { name: /Party Hits/ }).click();
  await expect(songs).toBeHidden();
}

test("start, lobby and buzzer quiz", async ({ browser }) => {
  const host = await login(await phone(browser));
  const start = await shot(host, "start");
  const code = await create(host, "Buzzer");
  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  const p: Record<string, Page> = {};
  for (const name of PLAYERS) p[name] = await join(await phone(browser), code, name);
  const lobby = await shot(p.Lea, "lobby");
  const tvLobby = await shot(screen, "tv-lobby");

  await host.getByRole("button", { name: "Spiel starten" }).click();
  await host.getByRole("tab", { name: "Suchen" }).click();
  await host.getByLabel("Song suchen").fill("Take On Me");
  await host.getByRole("button", { name: /^Take On Me/ }).first().click();
  await host.getByRole("button", { name: "Abspielen" }).click();
  await expect(p.Ben.getByRole("button", { name: "BUZZ" })).toBeVisible();
  const buzz = await shot(p.Ben, "buzz", 6000);

  await p.Tom.getByRole("button", { name: "BUZZ" }).click();
  await expect(host.getByText("Tom hat gebuzzert!")).toBeVisible();
  const judge = await shot(host, "judge");
  const tvBuzz = await shot(screen, "tv-buzz", 0);

  await compose(browser, path.join(OUT, "step-1.png"), { phones: [start] });
  await compose(browser, path.join(OUT, "step-2.png"), { phones: [lobby] });
  await compose(browser, path.join(OUT, "step-3.png"), { phones: [buzz] });
  await compose(browser, path.join(OUT, "hero.png"), { tv: tvLobby, phones: [buzz, judge] });
  await compose(browser, path.join(OUT, "mode-buzzer.png"), { tv: tvBuzz, phones: [buzz] });
});

test("everyone vs. everyone", async ({ browser }) => {
  const t = await table(browser, "Buzzer", "Alle gegen alle");
  await pickPlaylist(t.host);
  await t.host.getByRole("button", { name: "Spiel starten" }).click();
  await expect(t.Tom.getByRole("button", { name: "BUZZ" })).toBeVisible({ timeout: 15_000 });
  await t.Tom.waitForTimeout(4000);
  await t.Tom.getByRole("button", { name: "BUZZ" }).click();
  await t.Tom.getByRole("button", { name: /Lösung zeigen/ }).click();
  await t.Tom.getByRole("button", { name: /Richtig/ }).click();
  await t.Lea.getByRole("button", { name: /^Stimmt$/ }).click();
  await expect(t.screen.getByText("Tom sagt: richtig! Stimmt das?")).toBeVisible();
  const vote = await shot(t.Ben, "versus-vote");
  const tvVote = await shot(t.screen, "tv-versus", 0);
  await compose(browser, path.join(OUT, "mode-versus.png"), { tv: tvVote, phones: [vote] });
});

test("timeline", async ({ browser }) => {
  const t = await table(browser, "Zeitstrahl");
  await pickPlaylist(t.host);
  await t.host.getByRole("button", { name: "Spiel starten" }).click();
  // Whoever is up taps a gap; the others see it live
  const gaps = t.host.getByRole("button", { name: /^(Vor|Nach|Zwischen) / });
  await expect(gaps.first()).toBeVisible({ timeout: 15_000 });
  await gaps.last().click();
  const place = await shot(t.host, "timeline-place", 4000);
  const tvPlace = await shot(t.screen, "tv-timeline", 0);
  await compose(browser, path.join(OUT, "mode-timeline.png"), { tv: tvPlace, phones: [place] });
});

test("timeline, all at once", async ({ browser }) => {
  const t = await table(browser, "Zeitstrahl", "Alle gleichzeitig");
  await pickPlaylist(t.host);
  await t.host.getByRole("button", { name: "Spiel starten" }).click();
  const pages = [t.host, t.Lea, t.Tom, t.Ben];
  for (const [i, page] of pages.entries()) {
    const gaps = page.getByRole("button", { name: /^(Vor|Nach|Zwischen) / });
    await expect(gaps.first()).toBeVisible({ timeout: 15_000 });
    await gaps.nth(i % 2 ? 0 : (await gaps.count()) - 1).click();
    await page.getByRole("button", { name: /^Fertig/ }).click();
  }
  await expect(t.Lea.getByText(/^(Richtig gelegt!|Daneben)$/)).toBeVisible();
  const reveal = await shot(t.Lea, "together-reveal");
  const tvReveal = await shot(t.screen, "tv-together", 0);
  await compose(browser, path.join(OUT, "mode-together.png"), { tv: tvReveal, phones: [reveal] });
});

test("guess the year", async ({ browser }) => {
  const t = await table(browser, "Jahr schätzen");
  await pickPlaylist(t.host);
  await t.host.getByRole("button", { name: "Spiel starten" }).click();
  await expect(t.Lea.getByRole("button", { name: /^Fertig/ })).toBeVisible({ timeout: 15_000 });
  await t.Tom.getByRole("button", { name: /^Minus 10/ }).click();
  await t.Tom.getByRole("button", { name: /^Fertig/ }).click();
  await t.Ben.getByRole("button", { name: /^Plus 1\b/ }).click();
  await t.Ben.getByRole("button", { name: /^Fertig/ }).click();
  await t.Lea.getByRole("button", { name: /^Minus 1\b/ }).click();
  const guess = await shot(t.Lea, "year-guess", 4000);
  const tvGuess = await shot(t.screen, "tv-year", 0);
  await compose(browser, path.join(OUT, "mode-year.png"), { tv: tvGuess, phones: [guess] });
});

test("four answers", async ({ browser }) => {
  const t = await table(browser, "Vier Antworten");
  await pickPlaylist(t.host);
  await t.host.getByRole("button", { name: "Spiel starten" }).click();
  const answers = t.Lea.getByRole("button", { name: /^[1-4]: / });
  await expect(answers.first()).toBeVisible({ timeout: 15_000 });
  await t.Tom.getByRole("button", { name: /^2: / }).click();
  await t.Ben.getByRole("button", { name: /^3: / }).click();
  const choose = await shot(t.Lea, "choice", 4000);
  const tvChoose = await shot(t.screen, "tv-choice", 0);
  await compose(browser, path.join(OUT, "mode-choice.png"), { tv: tvChoose, phones: [choose] });
});
