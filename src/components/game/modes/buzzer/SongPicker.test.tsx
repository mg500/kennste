// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameApi } from "@/lib/game/client";
import type { Track } from "@/lib/game/types";
import { SongPicker } from "./SongPicker";

const song = (i: number): Track => ({ id: `t${i}`, name: `Song ${i}`, artist: "Band", albumArt: null, previewUrl: null });

function setup() {
  // 25 matching songs, 10 per page
  const searchTracks = vi.fn(async (q: string, offset = 0) => {
    const all = Array.from({ length: 25 }, (_, i) => song(i));
    return { tracks: q ? all.slice(offset, offset + 10) : [], more: offset + 10 < all.length };
  });
  const api = { searchTracks } as unknown as GameApi;
  const picker = () => <SongPicker api={api} gameId="g1" playerId="a" />;
  return { searchTracks, picker };
}

const shown = () => screen.queryAllByRole("button", { name: /^Song \d+/ }).length;

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("SongPicker", () => {
  it("loads more results at the end of the list", async () => {
    const { searchTracks, picker } = setup();
    render(picker());
    fireEvent.change(screen.getByLabelText("Song suchen"), { target: { value: "song" } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(shown()).toBe(10);

    fireEvent.click(screen.getByRole("button", { name: "Mehr Ergebnisse" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(shown()).toBe(20);
    expect(searchTracks).toHaveBeenLastCalledWith("song", 10);
    fireEvent.click(screen.getByRole("button", { name: "Mehr Ergebnisse" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(shown()).toBe(25);
    expect(screen.queryByRole("button", { name: "Mehr Ergebnisse" })).toBeNull();
  });

  it("keeps the search and the picked song when the round changes in between", async () => {
    const { picker } = setup();
    const first = render(picker());
    fireEvent.change(screen.getByLabelText("Song suchen"), { target: { value: "song" } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    fireEvent.click(screen.getByRole("button", { name: /^Song 3/ }));
    first.unmount(); // someone else's song starts: the picker goes away

    render(picker()); // next time it's back where it was
    expect((screen.getByLabelText("Song suchen") as HTMLInputElement).value).toBe("song");
    expect(screen.getByText("Song 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Auswahl verwerfen" }));
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(shown()).toBe(10); // the results are still there, too
  });
});
