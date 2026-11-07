// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameApi } from "@/lib/game/client";
import { addPlayer, applyAction, newGame } from "@/lib/game/reducer";
import type { Action, Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { GameLobby } from "./GameLobby";

/** Lobby with host H and players A, B. */
function lobby(...actions: Action[]): Game {
  let g = newGame("g1", 0);
  for (const [i, id] of ["h", "a", "b"].entries()) g = addPlayer(g, { id, name: id.toUpperCase(), joinedAt: i })!;
  for (const action of actions) {
    const r = applyAction(g, "h", action, { now: 0, random: () => 0 });
    if (!r.ok) throw new Error(r.error);
    g = r.game;
  }
  return g;
}

function controls() {
  const act = vi.fn(async () => {});
  const api = {
    searchPlaylists: vi.fn(async () => []), music: vi.fn(async () => undefined), listDevices: vi.fn(async () => ({ devices: [] })),
    pairScreen: vi.fn(async (code: string) => (code === "4712" ? undefined : "Kein Fernseher mit diesem Code – steht ein neuer auf dem TV?")),
  };
  return { act, api, controls: { api: api as unknown as GameApi, act, applyGame: () => {} } satisfies GameControls };
}

afterEach(cleanup);

describe("GameLobby", () => {
  it("the main rules are right in the card, the rest under „Weitere Einstellungen“", async () => {
    const { act: send, controls: c } = controls();
    const { unmount } = render(<GameLobby game={lobby()} controls={c} myId="h" />);
    const card = screen.getByRole("region", { name: "Was spielen wir?" });
    for (const rule of ["Runden", "Zeit zum Antworten", "Erlaubte Tipps"]) expect(within(card).getByText(rule)).toBeTruthy();
    expect(within(card).queryByText("Auflösen nach")).toBeNull();
    fireEvent.click(within(card).getByRole("group", { name: "Runden" }).querySelector("button:last-child")!);
    expect(send).toHaveBeenCalledWith({ type: "updateSettings", patch: { maxRounds: 6 } });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Weitere Einstellungen" })); });
    const more = screen.getByRole("dialog", { name: "Weitere Einstellungen" });
    for (const rule of ["Reihenfolge", "Auflösen nach", "Zufällige Startstelle statt Intro"]) expect(within(more).getByText(rule)).toBeTruthy();
    expect(within(more).queryByText("Spielziel")).toBeNull();
    unmount();

    // Everyone plays at once: no turn order, and the length is counted in songs
    render(<GameLobby game={lobby({ type: "setMode", mode: "year" })} controls={c} myId="h" />);
    expect(within(screen.getByRole("region", { name: "Was spielen wir?" })).getByRole("group", { name: "Songs" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Weitere Einstellungen" })); });
    expect(within(screen.getByRole("dialog", { name: "Weitere Einstellungen" })).queryByText("Reihenfolge")).toBeNull();
  });

  it("a missing playlist is right in the game card and blocks the start", async () => {
    const { controls: c } = controls();
    render(<GameLobby game={lobby({ type: "setMode", mode: "year" })} controls={c} myId="h" />);
    expect(screen.getByText("Wähl noch eine Playlist aus")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Spiel starten" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Songs: Playlist wählen" })); });
    expect(within(screen.getByRole("dialog", { name: "Songs" })).getByLabelText("Playlist suchen")).toBeTruthy();
  });

  it("the host lets a player only watch or removes them", () => {
    const { act: send, controls: c } = controls();
    const { rerender } = render(<GameLobby game={lobby()} controls={c} myId="h" />);
    fireEvent.click(screen.getByRole("button", { name: "A verwalten" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "A" })).getByRole("button", { name: "Nur zuschauen lassen" }));
    expect(send).toHaveBeenLastCalledWith({ type: "toggleViewer", playerId: "a" });
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<GameLobby game={lobby({ type: "toggleViewer", playerId: "a" })} controls={c} myId="h" />);
    fireEvent.click(screen.getByRole("button", { name: "A (schaut zu) verwalten" }));
    fireEvent.click(screen.getByRole("button", { name: "Mitspielen lassen" }));
    expect(send).toHaveBeenLastCalledWith({ type: "toggleViewer", playerId: "a" });

    fireEvent.click(screen.getByRole("button", { name: "B verwalten" }));
    fireEvent.click(screen.getByRole("button", { name: "Aus dem Spiel entfernen" }));
    expect(send).toHaveBeenLastCalledWith({ type: "kick", playerId: "b" });
  });

  it("everyone can invite from the code in the header", () => {
    const { controls: c } = controls();
    render(<GameLobby game={lobby()} controls={c} myId="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Einladen, Code g1" }));
    const invite = within(screen.getByRole("dialog", { name: "Mitspieler einladen" }));
    expect(invite.getByText("Scannen oder Code eingeben")).toBeTruthy();
    expect(invite.getByRole("link", { name: "TV-Ansicht" }).getAttribute("href")).toBe("/game/g1/screen");
  });

  it("the host switches the TV right next to “TV-Ansicht verbunden”, only while one is connected", () => {
    const { act: send, controls: c } = controls();
    const { rerender } = render(<GameLobby game={lobby()} controls={c} myId="h" />);
    expect(screen.queryByRole("radiogroup", { name: "Auf dem TV" })).toBeNull();

    rerender(<GameLobby game={{ ...lobby(), connectedScreens: 1 }} controls={c} myId="h" />);
    const tv = within(screen.getByRole("radiogroup", { name: "Auf dem TV" }));
    expect(tv.getByRole("radio", { name: "Lobby" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(tv.getByRole("radio", { name: "Läuft gerade" }));
    expect(send).toHaveBeenLastCalledWith({ type: "setScreenView", view: "nowPlaying" });

    // The others only see that a TV is connected
    rerender(<GameLobby game={{ ...lobby(), connectedScreens: 1 }} controls={c} myId="a" />);
    expect(screen.getByText("TV-Ansicht verbunden")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Auf dem TV" })).toBeNull();
  });

  it("the host connects a TV with the code it shows, as long as none is connected", async () => {
    const { api, controls: c } = controls();
    const { rerender } = render(<GameLobby game={lobby()} controls={c} myId="h" />);
    fireEvent.click(screen.getByRole("button", { name: "TV verbinden" }));
    const sheet = within(screen.getByRole("dialog", { name: "TV verbinden" }));
    const input = sheet.getByLabelText("Code vom Fernseher") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "47a" } });
    expect(input.value).toBe("47"); // digits only
    expect((sheet.getByRole("button", { name: "Verbinden" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "4713" } });
    await act(async () => { fireEvent.click(sheet.getByRole("button", { name: "Verbinden" })); });
    expect(sheet.getByText(/Kein Fernseher mit diesem Code/)).toBeTruthy();

    fireEvent.change(input, { target: { value: "4712" } });
    await act(async () => { fireEvent.click(sheet.getByRole("button", { name: "Verbinden" })); });
    expect(api.pairScreen).toHaveBeenLastCalledWith("4712");
    expect(sheet.getByText("Fernseher verbunden")).toBeTruthy();

    fireEvent.click(sheet.getByRole("button", { name: "Fertig" }));
    rerender(<GameLobby game={{ ...lobby(), connectedScreens: 1 }} controls={c} myId="h" />);
    expect(screen.queryByRole("button", { name: "TV verbinden" })).toBeNull();
  });

  it("players don't connect TVs", () => {
    const { controls: c } = controls();
    render(<GameLobby game={lobby()} controls={c} myId="a" />);
    expect(screen.queryByRole("button", { name: "TV verbinden" })).toBeNull();
  });
});

describe("Where the songs come from", () => {
  it("follows from the mode: no songs choice in the buzzer quiz, a playlist everywhere else", () => {
    const { controls: c } = controls();
    render(<GameLobby game={lobby()} controls={c} myId="h" />);
    expect(screen.queryByRole("button", { name: /^Songs:/ })).toBeNull();
    cleanup();
    render(<GameLobby game={lobby({ type: "setMode", mode: "versus" })} controls={c} myId="h" />);
    expect(screen.getByRole("button", { name: "Songs: Playlist wählen" })).toBeTruthy();
  });

  it("switching back to the buzzer quiz leaves the playlist behind", () => {
    const g = lobby({ type: "setMode", mode: "year" }, { type: "setMode", mode: "buzzer" }, { type: "updateSettings", patch: { songSource: "playlist" } });
    expect(g.settings.songSource).toBe("players");
  });
});

describe("Choosing the mode and its variant", () => {
  const variant = (name: string) => within(screen.getByRole("radiogroup", { name: "Variante" })).getByRole("radio", { name: new RegExp(`^${name}`) });

  it("shows the variants of the chosen mode with what makes the chosen one different", () => {
    const { controls: c } = controls();
    render(<GameLobby game={lobby({ type: "setMode", mode: "timeline" }, { type: "updateModeSettings", patch: { coop: true } })} controls={c} myId="h" />);
    expect(variant("Im Team").getAttribute("aria-checked")).toBe("true");
    expect(variant("Jeder für sich").getAttribute("aria-checked")).toBe("false");
    expect(screen.getAllByText(/die anderen schlagen Lücken vor/).length).toBeGreaterThan(0);
  });

  it("a variant of the same mode changes its settings, one of another mode switches the mode", async () => {
    const { act: send, controls: c } = controls();
    render(<GameLobby game={lobby({ type: "setMode", mode: "timeline" })} controls={c} myId="h" />);
    await act(async () => { fireEvent.click(variant("Im Team")); });
    expect(send.mock.calls).toEqual([[{ type: "updateModeSettings", patch: { coop: true } }]]);

    send.mockClear();
    await act(async () => { fireEvent.click(variant("Alle gleichzeitig")); });
    expect(send.mock.calls).toEqual([[{ type: "setMode", mode: "together" }]]);
  });

  it("the chosen game has its color from the start page, not the same for all", () => {
    const { controls: c } = controls();
    render(<GameLobby game={lobby({ type: "setMode", mode: "together" })} controls={c} myId="h" />);
    const chosen = within(screen.getAllByRole("group", { name: "Spielmodus" })[0]).getByRole("button", { pressed: true });
    expect(chosen.textContent).toMatch(/^Zeitstrahl/);
    expect(chosen.className).toContain("bg-positive");
    expect(chosen.className).not.toContain("bg-buzz");
  });

  it("another mode starts with its first variant; the mode list closes", async () => {
    const { act: send, controls: c } = controls();
    render(<GameLobby game={lobby()} controls={c} myId="h" />);
    fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
    const list = screen.getByRole("dialog", { name: "Spielmodus" });
    await act(async () => { fireEvent.click(within(list).getByRole("button", { name: /^Vier Antworten/ })); });
    expect(send.mock.calls).toEqual([[{ type: "setMode", mode: "choice" }], [{ type: "updateModeSettings", patch: { ask: "title" } }]]);
    expect(screen.queryByRole("dialog", { name: "Spielmodus" })).toBeNull();
  });
});
