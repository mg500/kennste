import { expect, test } from "@playwright/test";
import { hostGame, join, phone, playOnSpotify, resetSpotify } from "./helpers";

test.beforeEach(resetSpotify);

test("Nach einem Verbindungsabbruch geht es weiter, statt „Das Spiel ist vorbei“", async ({ browser }) => {
  await playOnSpotify("t3");
  const { page: host, code } = await hostGame(await phone(browser), "Buzzer");
  const leaContext = await phone(browser);
  // Keep a handle on the page's live streams
  await leaContext.addInitScript(() => {
    const Original = window.EventSource;
    const streams: EventSource[] = [];
    (window as unknown as { __streams: EventSource[] }).__streams = streams;
    window.EventSource = class extends Original {
      constructor(url: string | URL, init?: EventSourceInit) { super(url, init); streams.push(this); }
    };
  });
  const lea = await join(leaContext, code, "Lea");

  // Lea's phone browser drops the live stream for good, as mobile browsers do in the background (desktop
  // Chromium keeps it open when going offline, so this is done by hand). Meanwhile the host changes the mode.
  await lea.evaluate(() => {
    const stream = (window as unknown as { __streams: EventSource[] }).__streams.at(-1)!;
    stream.close();
    stream.dispatchEvent(new Event("error"));
  });
  await host.getByRole("button", { name: "Ändern" }).click();
  await host.getByRole("dialog", { name: "Spielmodus" }).getByRole("button", { name: /^Zeitstrahl/ }).click();
  await expect(host.locator("main")).toContainText("Karten zum Sieg");

  await expect(lea.locator("main")).toContainText("Bis 10 Karten");
  await expect(lea.getByText("Das Spiel ist vorbei")).toHaveCount(0);
});

test("Wer einen alten Link öffnet, erfährt, dass das Spiel vorbei ist", async ({ browser }) => {
  const page = await (await phone(browser)).newPage();
  await page.goto("/game/zzzzzz");
  await expect(page.getByText("Das Spiel ist vorbei")).toBeVisible();
});
