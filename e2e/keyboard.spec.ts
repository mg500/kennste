import { expect, test } from "@playwright/test";
import { hostGame, join, laptop, playOnSpotify, resetSpotify, spotifyPlayer } from "./helpers";

test.beforeEach(resetSpotify);

test("Buzzer-Quiz am Laptop nur mit der Tastatur: buzzern, bewerten, weiter, Play/Pause", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await laptop(browser), "Buzzer");
  const lea = await join(await laptop(browser), code, "Lea");

  // Songs from a playlist, so the round starts right away
  await host.getByRole("button", { name: /^Songs:/ }).click();
  const rules = host.getByRole("dialog", { name: "Songs" });
  await rules.getByRole("radio", { name: "Playlist" }).click();
  await rules.getByRole("button", { name: /Eigene Playlists/ }).click();
  await rules.getByRole("button", { name: /Party Hits/ }).click();
  // Picking it closes the sheet, the card shows the playlist
  await expect(rules).toBeHidden();
  await expect(host.getByRole("button", { name: /^Songs: Party Hits/ })).toBeVisible();
  await host.getByRole("button", { name: "Spiel starten" }).click();
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

  // Now it's Lea's turn: P pauses and resumes (once her page shows the song playing, like the button next to it)
  await expect(lea.getByRole("button", { name: "Pause" })).toBeVisible();
  await lea.keyboard.press("p");
  await expect.poll(async () => (await spotifyPlayer()).isPlaying).toBe(false);
  await expect(lea.getByRole("button", { name: "Abspielen" })).toBeVisible();
  await lea.keyboard.press("p");
  await expect.poll(async () => (await spotifyPlayer()).isPlaying).toBe(true);
});
