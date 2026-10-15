import { expect, test } from "@playwright/test";
import { hostGame, join, phone, playOnSpotify, resetSpotify, tv } from "./helpers";

test.beforeEach(resetSpotify);

test("Mitspieler treten per Code bei, der TV zeigt sie und was gerade läuft", async ({ browser }) => {
  await playOnSpotify("t3");
  const { page: host, code } = await hostGame(await phone(browser), "Buzzer-Quiz");

  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  await expect(screen.getByText("Scannen oder Code eingeben")).toBeVisible();
  await expect(host.getByText("TV-Ansicht verbunden")).toBeVisible();

  await join(await phone(browser), code, "Lea");
  await expect(screen.locator("main")).toContainText("Lea");
  await expect(host.locator("main")).toContainText("Lea");

  // What plays: on the host's music card and on the TV
  await expect(host.getByText("Song 3")).toBeVisible();
  await expect(screen.getByText("Läuft gerade")).toBeVisible();
  await expect(screen.getByText("Song 3")).toBeVisible();

  // The host switches the TV to "what's playing" and back
  await host.getByRole("radio", { name: "Läuft gerade" }).click();
  await expect(screen.getByRole("heading", { name: "Song 3" })).toBeVisible();
  await expect(screen.getByText("Scannen oder Code eingeben")).toBeHidden();
  await host.getByRole("radio", { name: "Lobby" }).click();
  await expect(screen.getByText("Scannen oder Code eingeben")).toBeVisible();
});
