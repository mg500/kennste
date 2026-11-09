import { expect, test, type Page } from "@playwright/test";
import { hostGame, join, phone, playOnSpotify, resetSpotify, smallPhone, tv } from "./helpers";

test.beforeEach(resetSpotify);

/** The code a TV on /tv shows. */
async function pairingCode(screen: Page): Promise<string> {
  const label = await screen.getByRole("img", { name: /Kopplungscode/ }).getAttribute("aria-label");
  return label!.replace(/\D/g, "");
}

test("Fernseher per Code verbinden – nach dem Spiel zeigt er den nächsten Code", async ({ browser }) => {
  await playOnSpotify("t3");
  const { page: host, code } = await hostGame(await smallPhone(browser), "Buzzer");
  const screen = await (await tv(browser)).newPage();
  await screen.goto("/tv");
  const first = await pairingCode(screen);

  // The host types the TV's code into their phone – connecting it is right at the top, before the rules
  await expect(host.getByRole("button", { name: "TV verbinden" })).toBeInViewport();
  await host.getByRole("button", { name: "TV verbinden" }).click();
  await host.getByLabel("Code vom Fernseher").fill(first);
  await host.getByRole("button", { name: "Verbinden", exact: true }).click();
  await expect(host.getByText("Fernseher verbunden")).toBeVisible();

  // The TV switches to the game's lobby on its own
  await expect(screen.getByText("Verbunden!")).toBeVisible();
  await expect(screen).toHaveURL(new RegExp(`/game/${code}/screen$`));
  await expect(screen.getByText("Scannen oder Code eingeben")).toBeVisible();
  await host.getByRole("button", { name: "Fertig" }).click();
  await expect(host.getByText("TV-Ansicht verbunden")).toBeVisible();
  await expect(host.getByRole("button", { name: "TV verbinden" })).toHaveCount(0);

  // The host closes the lobby: the TV is ready for the next game with a new code
  await host.getByRole("button", { name: "Spielmenü" }).click();
  await host.getByRole("button", { name: "Lobby schließen" }).click();
  await host.getByRole("dialog", { name: "Spielmenü" }).getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(screen).toHaveURL(/\/tv$/);
  await expect.poll(() => pairingCode(screen)).not.toBe(first);
});

test("Fernseher per QR-Code verbinden: der Host bestätigt am Handy", async ({ browser }) => {
  await playOnSpotify("t3");
  const { page: host, code } = await hostGame(await phone(browser), "Buzzer");
  const screen = await (await tv(browser)).newPage();
  await screen.goto("/tv");

  // Scanning opens this address on the host's phone
  await host.goto(`/tv/pair/${await pairingCode(screen)}`);
  await expect(host.getByRole("heading", { name: "Diesen Fernseher verbinden?" })).toBeVisible();
  await expect(host.getByText(`Spiel ${code}`, { exact: false })).toBeVisible();
  await host.getByRole("button", { name: "TV verbinden" }).click();
  await expect(host.getByText("Fernseher verbunden")).toBeVisible();

  await expect(screen).toHaveURL(new RegExp(`/game/${code}/screen$`));
  await host.getByRole("link", { name: "Zurück zum Spiel" }).click();
  await expect(host.getByText("TV-Ansicht verbunden")).toBeVisible();
});

test("Die TV-Ansicht passt ohne Scrollen auf kleinere Fernseher – auch auf einen, der sich als 960×540 meldet", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await phone(browser), "Jahr schätzen");
  const screens: Page[] = [];
  for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 540 }]) {
    const screen = await (await browser.newContext({ viewport })).newPage();
    await screen.goto(`/game/${code}/screen`);
    screens.push(screen);
  }
  const players = [];
  for (const name of ["Lea", "Tom", "Anastasia", "Ben"]) players.push(await join(await phone(browser), code, name));

  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  const songs = host.getByRole("dialog", { name: "Songs" });
  await songs.getByRole("button", { name: /Eigene Playlists/ }).click();
  await songs.getByRole("button", { name: /Party Hits/ }).click();
  await expect(songs).toBeHidden();
  await host.getByRole("button", { name: "Spiel starten" }).click();
  for (const page of [host, ...players]) await page.getByRole("button", { name: /^Fertig/ }).click();

  // Revealed – the tallest view: song, everyone's guess on the scale, player cards and who's up next
  for (const screen of screens) {
    await expect(screen.getByRole("list", { name: "Spieler" })).toBeVisible(); // the TV view, not the phone's
    await expect(screen.locator("main")).toContainText("Warte auf Max");
    expect(await screen.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(screen.viewportSize()!.height);
    await expect(screen.getByText("Warte auf Max")).toBeInViewport();
  }
});
