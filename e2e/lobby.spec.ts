import { expect, test } from "@playwright/test";
import { hostGame, join, phone, playOnSpotify, resetSpotify, smallPhone, tv } from "./helpers";

test.beforeEach(resetSpotify);

test("Mitspieler treten per Code bei, der TV zeigt sie und was gerade läuft", async ({ browser }) => {
  await playOnSpotify("t3");
  const { page: host, code } = await hostGame(await phone(browser), "Buzzer");

  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  await expect(screen.getByText("Scannen oder Code eingeben")).toBeVisible();
  await expect(host.getByText("TV-Ansicht verbunden")).toBeVisible();

  await join(await phone(browser), code, "Lea");
  await expect(screen.locator("main")).toContainText("Lea");
  await expect(host.locator("main")).toContainText("Lea");

  // What plays: in the host's music row and on the TV
  await expect(host.getByText("Song 3", { exact: false })).toBeVisible();
  await expect(screen.getByText("Läuft gerade")).toBeVisible();
  await expect(screen.getByText("Song 3")).toBeVisible();

  // The host switches the TV to "what's playing" and back, right next to "TV-Ansicht verbunden"
  const tvView = host.getByRole("radiogroup", { name: "Auf dem TV" });
  await host.getByText("TV-Ansicht verbunden").scrollIntoViewIfNeeded();
  await expect(tvView).toBeInViewport();
  await tvView.getByRole("radio", { name: "Läuft gerade" }).click();
  await expect(screen.getByRole("heading", { name: "Song 3" })).toBeVisible();
  await expect(screen.getByText("Scannen oder Code eingeben")).toBeHidden();
  await tvView.getByRole("radio", { name: "Lobby" }).click();
  await expect(screen.getByText("Scannen oder Code eingeben")).toBeVisible();
});

test("Menüs schließen wie in einer App: Zurück-Geste und nach unten wischen", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await phone(browser), "Jahr schätzen");
  const songs = host.getByRole("dialog", { name: "Songs" });

  // Going back closes the menu, the game stays
  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  await expect(songs).toBeVisible();
  await host.goBack();
  await expect(songs).toBeHidden();
  expect(host.url()).toContain(`/game/${code}`);

  // Closing it with "Fertig" takes its history entry back: no extra step back needed later
  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  await songs.getByRole("button", { name: "Fertig" }).click();
  await expect(songs).toBeHidden();
  expect(host.url()).toContain(`/game/${code}`);

  // Pulling it down by the handle closes it
  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  const grab = songs.getByTestId("sheet-grab");
  const box = (await grab.boundingBox())!;
  const at = (y: number) => ({ pointerType: "touch", pointerId: 7, isPrimary: true, clientX: box.x + 40, clientY: y, bubbles: true });
  await grab.dispatchEvent("pointerdown", at(box.y + 10));
  await grab.dispatchEvent("pointermove", at(box.y + 120));
  await grab.dispatchEvent("pointermove", at(box.y + 260));
  await grab.dispatchEvent("pointerup", at(box.y + 260));
  await expect(songs).toBeHidden();
  expect(host.url()).toContain(`/game/${code}`);
});

test("Lange Menüs scrollen, statt den Button am Ende zu stauchen", async ({ browser }) => {
  await playOnSpotify("t3");
  const { page: host } = await hostGame(await smallPhone(browser), "Buzzer");
  await host.getByRole("button", { name: "So geht's" }).click();
  const done = host.getByRole("dialog", { name: "So geht's" }).getByRole("button", { name: "Alles klar" });
  await done.scrollIntoViewIfNeeded();
  await expect(done).toBeVisible();
  expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(56);
});

test("Aus dem Einladen-Menü geht es direkt zu „TV verbinden“", async ({ browser }) => {
  await playOnSpotify("t3");
  const { page: host, code } = await hostGame(await phone(browser), "Buzzer");
  await host.getByRole("button", { name: `Einladen, Code ${code}` }).click();
  await host.getByRole("dialog", { name: "Mitspieler einladen" }).getByRole("button", { name: "TV verbinden" }).click();
  const pair = host.getByRole("dialog", { name: "TV verbinden" });
  await expect(pair).toBeVisible();
  // Stays open (the invite menu going back in history must not close it)
  await host.waitForTimeout(500);
  await expect(pair).toBeVisible();
  await expect(host.getByRole("dialog", { name: "Mitspieler einladen" })).toBeHidden();

  // Going back closes it, the game stays
  await host.goBack();
  await expect(pair).toBeHidden();
  expect(host.url()).toContain(`/game/${code}`);
});
