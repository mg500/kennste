import { expect, test, type Page } from "@playwright/test";
import { hostGame, join, laptop, playOnSpotify, resetSpotify, spotifyPlayer } from "./helpers";

test.beforeEach(resetSpotify);

/** Whoever is up searches a song and plays it. */
async function pick(page: Page, name: string) {
  await page.getByRole("tab", { name: "Suchen" }).click();
  await page.getByLabel("Song suchen").fill(name);
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await page.getByRole("button", { name: "Abspielen" }).click();
}

test("Buzzer-Quiz am Laptop nur mit der Tastatur: buzzern, bewerten, weiter, Play/Pause", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await laptop(browser), "Buzzer");
  const lea = await join(await laptop(browser), code, "Lea");

  // The host puts on a song from the search
  await host.getByRole("button", { name: "Spiel starten" }).click();
  await pick(host, "Song 12");
  await expect(host.getByText("Warte auf einen Buzz …")).toBeVisible();
  await expect.poll(async () => (await spotifyPlayer()).isPlaying).toBe(true);

  // Space buzzes (and pauses the song), R rates the answer correct, Enter continues
  await lea.keyboard.press("Space");
  await expect(host.getByText("Lea hat gebuzzert!")).toBeVisible();
  await expect.poll(async () => (await spotifyPlayer()).isPlaying).toBe(false);
  await host.keyboard.press("r");
  await expect(host.getByText("Lea hat's erraten!")).toBeVisible();
  await expect(lea.getByText("Du hast's erraten!")).toBeVisible();
  await lea.keyboard.press("Enter");

  // Now it's Lea's turn: she puts on a song, P pauses and resumes (once her page shows the song playing, like the button next to it)
  await pick(lea, "Song 13");
  await expect(lea.getByRole("button", { name: "Pause" })).toBeVisible();
  await lea.keyboard.press("p");
  await expect.poll(async () => (await spotifyPlayer()).isPlaying).toBe(false);
  await expect(lea.getByRole("button", { name: "Abspielen" })).toBeVisible();
  await lea.keyboard.press("p");
  await expect.poll(async () => (await spotifyPlayer()).isPlaying).toBe(true);
});
