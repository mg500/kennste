import { expect, test, type Page } from "@playwright/test";
import { hostGame, join, phone, playOnSpotify, resetSpotify } from "./helpers";

test.beforeEach(resetSpotify);

/** A sideways swipe with the finger at height `y` (share of the screen), wherever it lands. */
async function swipeLeft(page: Page, y: number) {
  await page.evaluate(y => {
    const at = (x: number) => ({ pointerType: "touch", pointerId: 3, isPrimary: true, clientX: x, clientY: y, bubbles: true });
    const target = document.elementFromPoint(300, y)!;
    target.dispatchEvent(new PointerEvent("pointerdown", at(300)));
    target.dispatchEvent(new PointerEvent("pointerup", at(120)));
  }, Math.round(page.viewportSize()!.height * y));
}

test("Spielende am Handy: Wischen wechselt die Tabs auch unterhalb kurzer Inhalte", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await phone(browser), "Jahr schätzen");
  const lea = await join(await phone(browser), code, "Lea");
  await host.getByRole("button", { name: /^Kurz/ }).click();
  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  const songs = host.getByRole("dialog", { name: "Songs" });
  await songs.getByRole("button", { name: /Eigene Playlists/ }).click();
  await songs.getByRole("button", { name: /Party Hits/ }).click();
  await expect(songs).toBeHidden();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  for (let round = 1; round <= 5; round++) {
    await lea.getByRole("button", { name: /^Fertig/ }).click();
    await host.getByRole("button", { name: /^Fertig/ }).click();
    await host.getByRole("button", { name: round < 5 ? /Nächster Song/ : "Zum Endstand" }).click();
  }

  const tab = (name: string) => lea.getByRole("tab", { name });
  await tab("Auszeichnungen").click();
  await expect(tab("Auszeichnungen")).toHaveAttribute("aria-selected", "true");
  // The awards fill only the top of the screen: swiping further down switches too
  await swipeLeft(lea, 0.8);
  await expect(tab("Songs")).toHaveAttribute("aria-selected", "true");
});
