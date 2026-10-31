import { expect, test, type Page } from "@playwright/test";
import { hostGame, phone, playOnSpotify, resetSpotify, tv } from "./helpers";

test.beforeEach(resetSpotify);

/** The code a TV on /tv shows. */
async function pairingCode(screen: Page): Promise<string> {
  const label = await screen.getByRole("img", { name: /Kopplungscode/ }).getAttribute("aria-label");
  return label!.replace(/\D/g, "");
}

test("Fernseher per Code verbinden – nach dem Spiel zeigt er den nächsten Code", async ({ browser }) => {
  await playOnSpotify("t3");
  const { page: host, code } = await hostGame(await phone(browser), "Buzzer");
  const screen = await (await tv(browser)).newPage();
  await screen.goto("/tv");
  const first = await pairingCode(screen);

  // The host types the TV's code into their phone
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
