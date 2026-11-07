import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpotifySim, trackFixture } from "@/test/spotifySim";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ sessionAccessToken: async () => "token" }));

const get = async (q = "") => (await (await GET(new Request(`http://test/?q=${encodeURIComponent(q)}`))).json()).tracks as { id: string }[];
const tracks = Array.from({ length: 10 }, (_, i) => trackFixture(i));

describe("GET /api/spotify/search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("without a query: the songs heard last, each once, newest first", async () => {
    vi.stubGlobal("fetch", createSpotifySim({ tracks, recentlyPlayed: ["t5", "t2", "t5", "t7", "t1", "t3"] }).fetch);
    expect((await get()).map(t => t.id)).toEqual(["t5", "t2", "t7", "t1"]);
    expect((await get("Song 9")).map(t => t.id)).toEqual(["t9"]);
  });

  it("no suggestions while the host's sign-in lacks the permission", async () => {
    const sim = createSpotifySim({ tracks, recentlyPlayed: ["t5"] });
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      url.includes("/recently-played") ? Promise.resolve(Response.json({ error: { status: 403 } }, { status: 403 })) : sim.fetch(url, init));
    expect(await get()).toEqual([]);
  });
});
