import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginShutdown, resetLifecycle } from "./lifecycle";
import { hostKey, markPlayed, playedSongs, resetPlayedSongs, savePlayedSongs } from "./playedSongs";

const DAY = 24 * 3600_000;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "kennste-"));
  vi.stubEnv("DATA_DIR", dir);
  resetPlayedSongs();
  resetLifecycle();
});
afterEach(() => {
  resetPlayedSongs();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("played songs", () => {
  it("survive a restart through the file, and the file holds no login", () => {
    const host = hostKey("max@example.de");
    markPlayed(host, ["t1", "t2"], 1000);
    savePlayedSongs(1000);
    resetPlayedSongs(); // the server restarts
    expect([...playedSongs(host, 2000)]).toEqual([["t1", 1000], ["t2", 1000]]);
    expect(readFileSync(path.join(dir, "played-songs.json"), "utf8")).not.toContain("max@example.de");
  });

  it("are kept per host", () => {
    markPlayed(hostKey("a"), ["t1"], 1000);
    expect(playedSongs(hostKey("b"), 1000).size).toBe(0);
  });

  it("count as fresh again after half a year", () => {
    const host = hostKey("a");
    markPlayed(host, ["old"], 0);
    markPlayed(host, ["new"], 170 * DAY);
    expect([...playedSongs(host, 181 * DAY).keys()]).toEqual(["new"]);
    savePlayedSongs(181 * DAY);
    expect(readFileSync(path.join(dir, "played-songs.json"), "utf8")).not.toContain("old");
  });

  it("are written when the server shuts down", () => {
    markPlayed(hostKey("a"), ["t1"]);
    beginShutdown();
    expect(readFileSync(path.join(dir, "played-songs.json"), "utf8")).toContain("t1");
  });

  it("a broken file starts empty instead of failing", () => {
    writeFileSync(path.join(dir, "played-songs.json"), "{not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(playedSongs(hostKey("a")).size).toBe(0);
    markPlayed(hostKey("a"), ["t1"]);
    expect(playedSongs(hostKey("a")).size).toBe(1);
  });

  it("without DATA_DIR they are only kept in memory", () => {
    vi.stubEnv("DATA_DIR", "");
    markPlayed(hostKey("a"), ["t1"]);
    savePlayedSongs();
    expect(playedSongs(hostKey("a")).size).toBe(1);
    expect(() => readFileSync(path.join(dir, "played-songs.json"))).toThrow();
  });
});
