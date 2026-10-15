import { expect, test } from "@playwright/test";
import { hostGame, join, phone, playOnSpotify, resetSpotify, smallPhone, spotifyPlayer, tv } from "./helpers";

test.beforeEach(resetSpotify);

test("Jahr schätzen: Runde spielen, anstupsen, der Weiter-Button bleibt sichtbar", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await smallPhone(browser), "Jahr schätzen");
  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  const lea = await join(await phone(browser), code, "Lea");

  // The host picks one of their playlists and starts
  await host.getByRole("button", { name: "Anpassen" }).click();
  const rules = host.getByRole("dialog", { name: "Regeln anpassen" });
  await expect(rules.getByText("Deine Playlists")).toBeVisible();
  await rules.getByRole("button", { name: /Party Hits/ }).click();
  await expect(rules.getByText("Gewählte Playlist")).toBeVisible();
  await rules.getByRole("button", { name: "Fertig" }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  // The first song plays on the host's Spotify, everyone guesses
  await expect(lea.getByRole("button", { name: /tippen/ })).toBeVisible();
  const first = (await spotifyPlayer()).current;
  expect(Number(first?.slice(1))).toBeLessThan(40); // a song of "Party Hits"
  await lea.getByRole("button", { name: /tippen/ }).click();
  await host.getByRole("button", { name: /tippen/ }).click();

  // Revealed: the host continues, Lea nudges
  const next = host.getByRole("button", { name: /Nächster Song/ });
  await expect(host.getByText("Du bist dran – alle warten auf dich")).toBeVisible();
  await expect(next).toBeInViewport();
  await expect(lea.getByText("macht weiter")).toBeVisible();
  await expect(lea.getByRole("button", { name: /Nächster Song/ })).toHaveCount(0);

  await lea.getByRole("button", { name: "Song skippen" }).click();
  await expect(lea.getByText("Angestupst")).toBeVisible();
  await expect(host.getByRole("img", { name: "Lea: Song skippen" })).toBeVisible();
  await expect(screen.getByRole("img", { name: "Lea: Song skippen" })).toBeVisible();
  await expect(screen.locator("main")).toContainText("Warte auf Max");

  // Fixed at the bottom: in view at the top of the page too, although the page is longer than the screen
  await host.evaluate(() => window.scrollTo(0, 0));
  expect(await host.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
  await expect(next).toBeInViewport();
  await host.mouse.wheel(0, 2000);
  await expect(next).toBeInViewport();

  await next.click();
  await expect(lea.getByRole("button", { name: /tippen/ })).toBeVisible();
  await expect.poll(async () => (await spotifyPlayer()).current).not.toBe(first);
});
