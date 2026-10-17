import { expect, test } from "@playwright/test";
import { hostGame, join, phone, playOnSpotify, resetSpotify, smallPhone, spotifyPlayer, tv } from "./helpers";

test.beforeEach(resetSpotify);

test("Jahr schätzen: Runde spielen, der Weiter-Button bleibt sichtbar, die Mehrheit macht weiter", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await smallPhone(browser), "Jahr schätzen");
  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  const lea = await join(await phone(browser), code, "Lea");

  // The host picks one of their playlists and starts
  await expect(host.getByText("Wähl noch eine Playlist aus")).toBeVisible();
  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  const rules = host.getByRole("dialog", { name: "Songs" });
  await expect(rules.getByText("Deine Playlists")).toBeVisible();
  await rules.getByRole("button", { name: /Party Hits/ }).click();
  await expect(rules.getByText("Gewählte Playlist")).toBeVisible();
  await rules.getByRole("button", { name: "Fertig" }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  // The first song plays on the host's Spotify, everyone guesses
  await expect(lea.getByRole("button", { name: /^Fertig/ })).toBeVisible();
  const first = (await spotifyPlayer()).current;
  expect(Number(first?.slice(1))).toBeLessThan(40); // a song of "Party Hits"
  await lea.getByRole("button", { name: /^Fertig/ }).click();
  await host.getByRole("button", { name: /^Fertig/ }).click();

  // Revealed: the host continues, Lea can only vote to move on
  const next = host.getByRole("button", { name: /Nächster Song/ });
  await expect(host.getByText("Du bist dran – alle warten auf dich")).toBeVisible();
  await expect(next).toBeInViewport();
  await expect(lea.getByText("macht weiter")).toBeVisible();
  await expect(lea.getByRole("button", { name: /Nächster Song/ })).toHaveCount(0);
  await expect(screen.locator("main")).toContainText("Warte auf Max");

  // Fixed at the bottom: in view at the top of the page too, although the page is longer than the screen
  await host.evaluate(() => window.scrollTo(0, 0));
  expect(await host.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
  await expect(next).toBeInViewport();
  await host.mouse.wheel(0, 2000);
  await expect(next).toBeInViewport();

  // Lea is the only other player, so her vote is the majority: everyone sees the countdown, then it moves on
  await lea.getByRole("button", { name: /Weiter geht's!/ }).click();
  await expect(lea.getByRole("button", { name: /Doch nicht/ })).toBeVisible();
  await expect(screen.getByText("Lea will weitermachen")).toBeVisible();
  await expect(screen.getByText("Die Mehrheit will weitermachen")).toBeVisible();
  await expect(host.getByRole("button", { name: /Nächster Song · in \d s/ })).toBeInViewport();
  await expect(lea.getByRole("button", { name: /^Fertig/ })).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => (await spotifyPlayer()).current).not.toBe(first);
});
