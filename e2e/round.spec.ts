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
  await rules.getByRole("button", { name: /Eigene Playlists/ }).click();
  await rules.getByRole("button", { name: /Party Hits/ }).click();
  // Picking it closes the sheet, the card shows the playlist
  await expect(rules).toBeHidden();
  await expect(host.getByRole("button", { name: /^Songs: Party Hits/ })).toBeVisible();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  // Everyone sees the countdown, the TV too; only the host can call it off
  await expect(lea.getByText("Gleich geht's los")).toBeVisible();
  await expect(screen.getByText("Gleich geht's los")).toBeVisible();
  await expect(host.getByRole("button", { name: "Abbrechen" })).toBeVisible();
  await expect(lea.getByRole("button", { name: "Abbrechen" })).toBeHidden();

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

test("Buzzer mit eigenen Songs: nach der Auflösung geht es ohne Weiter-Klick zur Songsuche", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await phone(browser), "Buzzer");
  const lea = await join(await phone(browser), code, "Lea");
  await host.getByRole("button", { name: "Spiel starten" }).click();

  // The host picks a song from the search (browsing comes first)
  await host.getByRole("tab", { name: "Suchen" }).click();
  await host.getByLabel("Song suchen").fill("Song 12");
  await host.getByRole("button", { name: /^Song 12/ }).first().click();
  await host.getByRole("button", { name: "Abspielen" }).click();
  await expect(lea.getByRole("button", { name: "BUZZ" })).toBeVisible();

  await lea.getByRole("button", { name: "BUZZ" }).click();
  await host.getByRole("button", { name: /Richtig/ }).click();
  await expect(lea.getByText("Du hast's erraten!")).toBeVisible();
  await expect(lea.getByText("Du legst als Nächstes auf")).toBeVisible();

  // Nobody clicks: a few seconds later Lea searches, the last song stays visible
  await expect(lea.getByText("Du legst auf")).toBeVisible({ timeout: 13_000 });
  await expect(lea.getByLabel("Letzter Song")).toContainText("Song 12");
  await expect(host.getByText("Lea sucht einen Song …")).toBeVisible();
});

test("Zeitstrahl für alle: beide legen verdeckt, aufgelöst wird, sobald alle fertig sind", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await smallPhone(browser), "Zeitstrahl", "Alle gleichzeitig");
  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  const lea = await join(await phone(browser), code, "Lea");
  // Everyone in the room sees which variant is played
  await expect(screen.getByText("Alle gleichzeitig", { exact: true })).toBeVisible();
  await expect(lea.getByText("Zeitstrahl · Alle gleichzeitig")).toBeVisible();

  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  const rules = host.getByRole("dialog", { name: "Songs" });
  await rules.getByRole("button", { name: /Eigene Playlists/ }).click();
  await rules.getByRole("button", { name: /Party Hits/ }).click();
  await expect(rules).toBeHidden();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  // Lea places first: the TV shows that she is done, not where
  await lea.getByRole("button", { name: /^Vor / }).click();
  await lea.getByRole("button", { name: /^Fertig/ }).click();
  const cards = screen.getByRole("list", { name: "Spieler" });
  await expect(cards.getByRole("listitem").filter({ hasText: "Lea" })).toContainText("fertig");
  await expect(cards.getByRole("listitem").filter({ hasText: "Max" })).toContainText("legt …");
  await expect(lea.getByText("Fertig – warte auf die anderen …")).toBeVisible();

  // The host's button stays in view on a small phone, then it's revealed for everyone
  const done = host.getByRole("button", { name: /^Fertig/ });
  await host.getByRole("button", { name: /^Nach / }).click();
  await expect(done).toBeInViewport();
  await done.click();
  await expect(lea.getByText(/^(Richtig gelegt!|Daneben)$/)).toBeVisible();
  // On the TV, Lea is either on the new card (right) or in her crossed-out gap (wrong)
  await expect(screen.getByLabel(/richtig: .*Lea|Daneben: .*Lea/)).toBeVisible();
});

test("Alle gegen alle: wer buzzert, antwortet erst und sieht dann als Einziger die Lösung; die anderen stimmen ab", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await phone(browser), "Buzzer", "Alle gegen alle");
  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  const lea = await join(await phone(browser), code, "Lea");

  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  const rules = host.getByRole("dialog", { name: "Songs" });
  await rules.getByRole("button", { name: /Eigene Playlists/ }).click();
  await rules.getByRole("button", { name: /Party Hits/ }).click();
  await expect(rules).toBeHidden();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  await lea.getByRole("button", { name: "BUZZ" }).click();
  await expect(lea.getByText("Du bist dran!")).toBeVisible();
  await expect.poll(async () => (await spotifyPlayer()).isPlaying).toBe(false); // paused while Lea answers
  await expect(lea.getByText(/^Song \d+$/)).toHaveCount(0); // answering first, no peeking
  await expect(host.getByText("Lea hat gebuzzert!")).toBeVisible();
  await lea.getByRole("button", { name: /Lösung zeigen/ }).click();
  await expect(lea.getByText("Nur du siehst die Lösung.")).toBeVisible();
  await expect(lea.getByText(/^Song \d+$/)).toBeVisible();
  await expect(host.getByText("Lea prüft die Antwort …")).toBeVisible();
  await expect(host.getByText(/^Song \d+$/)).toHaveCount(0);

  // Lea claims it, the host doesn't confirm – he is the only other player, so there's no point
  await lea.getByRole("button", { name: /Richtig/ }).click();
  await expect(host.getByText("Lea sagt: richtig!")).toBeVisible();
  await expect(screen.getByText("Lea sagt: richtig! Stimmt das?")).toBeVisible();
  await expect(lea.getByText("Die anderen stimmen ab")).toBeVisible();
  await expect.poll(async () => (await spotifyPlayer()).isPlaying).toBe(true); // the music goes on during the vote
  await host.getByRole("button", { name: /Stimmt nicht/ }).click();
  await expect(lea.getByText("Nicht bestätigt – kein Punkt")).toBeVisible();
  await expect(screen.getByText("Nicht bestätigt – kein Punkt")).toBeVisible();
});

test("Lobby schließen nach einem Spiel: alle sehen den Rückblick auf alle Spiele, auch nach dem Neuladen", async ({ browser }) => {
  await playOnSpotify("t70");
  const { page: host, code } = await hostGame(await phone(browser), "Jahr schätzen");
  const screen = await (await tv(browser)).newPage();
  await screen.goto(`/game/${code}/screen`);
  const lea = await join(await phone(browser), code, "Lea");
  await host.getByRole("button", { name: "Songs: Playlist wählen" }).click();
  const songs = host.getByRole("dialog", { name: "Songs" });
  await songs.getByRole("button", { name: /Eigene Playlists/ }).click();
  await songs.getByRole("button", { name: /Party Hits/ }).click();
  await expect(songs).toBeHidden();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  // One song, then the host closes the lobby in the middle of the game
  await lea.getByRole("button", { name: /^Fertig/ }).click();
  await host.getByRole("button", { name: /^Fertig/ }).click();
  await expect(host.getByText("Du bist dran – alle warten auf dich")).toBeVisible();
  await host.getByRole("button", { name: "Spielmenü" }).first().click();
  const menu = host.getByRole("dialog", { name: "Spielmenü" });
  await menu.getByRole("button", { name: "Lobby schließen" }).click();
  await menu.getByRole("button", { name: "Schließen", exact: true }).click();

  for (const page of [host, lea, screen]) {
    await expect(page.getByRole("heading", { name: "Das war's!" })).toBeVisible();
    await expect(page.getByText("1 Spiel · 1 Song · 2 Spieler")).toBeVisible();
  }
  expect((await spotifyPlayer()).isPlaying).toBe(false);
  await expect(host.getByRole("button", { name: /Als Spotify-Playlist speichern/ })).toBeVisible();
  await lea.reload();
  await expect(lea.getByRole("heading", { name: "Das war's!" })).toBeVisible();
});
