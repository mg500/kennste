// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/lib/game/types";
import { TestSong } from "./MusicSetup";

const track = (id: string, name: string): Track => ({ id, name, artist: "Artist", releaseYear: "1985", albumArt: null, previewUrl: null });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const q = new URL(url, "http://test").searchParams.get("q");
    return Response.json({ tracks: q ? [track("s1", "Gesuchter Song")] : [track("r1", "Walk Of Life"), track("r2", "Your Latest Trick")] });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("Test song", () => {
  it("suggests the songs heard last until the host searches, and plays one with a tap", async () => {
    const onPlay = vi.fn();
    render(<TestSong disabled={false} onPlay={onPlay} />);
    await flush();
    expect(screen.getByText("Zuletzt gehört")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Walk Of Life abspielen" }));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));

    fireEvent.change(screen.getByLabelText("Testsong abspielen"), { target: { value: "gesucht" } });
    await flush(300);
    expect(screen.queryByText("Zuletzt gehört")).toBeNull();
    expect(screen.queryByText("Walk Of Life")).toBeNull();
    expect(screen.getByText("Gesuchter Song")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Testsong abspielen"), { target: { value: "" } });
    expect(screen.getByText("Walk Of Life")).toBeTruthy(); // back right away, no new request needed
  });
});
