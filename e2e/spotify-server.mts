/**
 * The Spotify simulator as an HTTP server for the end-to-end tests: the app talks to it instead of Spotify
 * (SPOTIFY_API_URL, SPOTIFY_ACCOUNTS_URL, MUSICBRAINZ_URL, see playwright.config.ts). Runs with
 * `node --experimental-strip-types`. Control endpoints: POST /__sim/reset, GET /__sim/player.
 */
import { createServer } from "node:http";
import { DOCS_SONGS } from "../scripts/docs-images/songs.ts";
import { createSpotifySim, trackFixture, type SpotifySim } from "../src/test/spotifySim.ts";

export const SIM_PORT = Number(process.env.SIM_PORT ?? 3199);

function freshSim(): SpotifySim {
  const tracks = process.env.SIM_CATALOG === "docs"
    ? DOCS_SONGS.map(([name, artist, year, cover], i) => trackFixture(i, { name, artist, year, cover }))
    : Array.from({ length: 80 }, (_, i) => trackFixture(i));
  return createSpotifySim({
    tracks,
    playlists: [
      { id: "party", name: "Party Hits", owner: "me", own: true, trackIds: tracks.slice(0, 40).map(t => t.id) },
      { id: "fremd", name: "Fremde Hits", owner: "spotify", own: false, trackIds: tracks.slice(40, 80).map(t => t.id) },
    ],
    devices: [{ id: "wohnzimmer", name: "Wohnzimmer", type: "Speaker" }],
    tokenLifetimeMs: 3600_000,
  });
}

let sim = freshSim();

createServer(async (req, res) => {
  const path = req.url ?? "/";
  const send = (status: number, body?: unknown) => {
    res.writeHead(status, body === undefined ? {} : { "Content-Type": "application/json" });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  if (path === "/__sim/health") return send(200, { ok: true });
  if (path === "/__sim/reset") { sim = freshSim(); return send(200, { ok: true }); }
  if (path === "/__sim/player") return send(200, { ...sim.player, current: sim.current()?.id ?? null, calls: sim.calls.length });

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
  // /v1/… → the Web API, /api/token → the accounts service, anything else (MusicBrainz) is unavailable
  const target = path.startsWith("/v1/") ? `https://api.spotify.com${path}`
    : path === "/api/token" ? "https://accounts.spotify.com/api/token" : `https://unavailable.invalid${path}`;
  const response = await sim.fetch(target, {
    method: req.method,
    headers: { Authorization: req.headers.authorization ?? "" },
    ...(body ? { body } : {}),
  });
  res.writeHead(response.status, { "Content-Type": response.headers.get("Content-Type") ?? "application/json" });
  res.end(response.status === 204 ? undefined : Buffer.from(await response.arrayBuffer()));
}).listen(SIM_PORT, "127.0.0.1", () => console.log(`Spotify-Simulator auf http://127.0.0.1:${SIM_PORT}`));
