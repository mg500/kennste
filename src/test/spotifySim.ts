/**
 * A small stateful stand-in for the Spotify Web API, as far as this app uses it: catalog, playlists (own ones
 * readable via /items, foreign ones only through the playback queue), Connect devices (also dormant ones),
 * playback with album/playlist contexts, queue, shuffle. Install it with `vi.stubGlobal("fetch", sim.fetch)`.
 * Requests to other hosts (MusicBrainz) fail with 503.
 */

export interface SimTrack { id: string; name: string; artist: string; year: number; albumId: string; durationMs: number }
export interface SimPlaylist { id: string; name: string; owner: string; own: boolean; trackIds: string[] }
export interface SimDevice { id: string; name: string; type: string; restricted?: boolean; dormant?: boolean }

interface PlayerState {
  deviceId: string | null;
  /** Context (album or playlist URI) and the track IDs in playback order. */
  contextUri: string | null;
  /** The context's songs in their own order, and in playback order (differs while shuffling). */
  contextIds: string[];
  order: string[];
  index: number;
  isPlaying: boolean;
  progressMs: number;
  shuffle: boolean;
}

/** Songs Spotify's queue shows after the current one. */
const QUEUE_LENGTH = 20;
const USER = "me";

export function trackFixture(i: number, extra: Partial<SimTrack> = {}): SimTrack {
  return { id: `t${i}`, name: `Song ${i}`, artist: `Artist ${i}`, year: 1960 + (i % 60), albumId: `al${i}`, durationMs: 200_000, ...extra };
}

/**
 * `lag`: like the real Spotify apps, the device applies a shuffle change and reports a play/pause change only a
 * moment later — here after that many reads of GET /me/player (code that waits for the state polls anyway).
 */
export function createSpotifySim(opts: { tracks?: SimTrack[]; playlists?: SimPlaylist[]; devices?: SimDevice[]; lag?: number } = {}) {
  const lag = opts.lag ?? 0;
  const tracks = new Map((opts.tracks ?? []).map(t => [t.id, t]));
  const playlists = new Map((opts.playlists ?? []).map(p => [p.id, p]));
  const devices: SimDevice[] = opts.devices ?? [{ id: "dev1", name: "Wohnzimmer", type: "Speaker" }];
  const player: PlayerState = { deviceId: devices[0]?.id ?? null, contextUri: null, contextIds: [], order: [], index: 0, isPlaying: false, progressMs: 0, shuffle: false };
  /** Every request as "METHOD /path?query". */
  const calls: string[] = [];
  /** Changes the device has not applied (shuffle) or reported (playing) yet. */
  let pendingShuffle: { value: boolean; reads: number } | null = null;
  let reported = { isPlaying: false, reads: 0 };
  /** Turning shuffle off while a context plays continues in the context's order after the current song. */
  const applyShuffle = (value: boolean) => {
    if (player.shuffle && !value && player.contextUri) {
      const id = player.order[player.index];
      player.order = [...player.contextIds];
      player.index = Math.max(0, player.order.indexOf(id));
    }
    player.shuffle = value;
  };
  const setPlaying = (value: boolean) => {
    if (value !== player.isPlaying) reported = { isPlaying: player.isPlaying, reads: lag };
    player.isPlaying = value;
  };
  /** Played contexts: "spotify:playlist:x@position" or "spotify:album:y@uri". */
  const plays: string[] = [];
  /** Tracks that play after the end of a context (autoplay). */
  const autoplay = Array.from({ length: QUEUE_LENGTH }, (_, i) => trackFixture(9000 + i, { name: `Autoplay ${i}` }));
  for (const t of autoplay) tracks.set(t.id, t);

  const trackJson = (t: SimTrack) => ({
    id: t.id, name: t.name, uri: `spotify:track:${t.id}`, duration_ms: t.durationMs, preview_url: null,
    artists: [{ name: t.artist }],
    album: { name: `Album ${t.albumId}`, uri: `spotify:album:${t.albumId}`, release_date: `${t.year}-01-01`, images: [] },
    external_ids: {},
  });
  const playlistJson = (p: SimPlaylist) => ({
    id: p.id, name: p.name, images: [], owner: { id: p.own ? USER : p.owner, display_name: p.own ? USER : p.owner }, items: { total: p.trackIds.length },
  });
  const deviceJson = (d: SimDevice) => ({ id: d.id, name: d.name, type: d.type, is_active: d.id === player.deviceId, is_restricted: !!d.restricted });
  const current = () => tracks.get(player.order[player.index]);
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const empty = (status = 204) => new Response(null, { status });

  /** The device a player command addresses, or an error response. */
  function target(url: URL): SimDevice | Response {
    const id = url.searchParams.get("device_id") ?? player.deviceId;
    const device = devices.find(d => d.id === id);
    if (!device) return json({ error: { status: 404, message: "Device not found" } }, 404);
    if (device.dormant) return json({ error: { status: 404, message: "Device not found" } }, 404);
    if (device.restricted) return json({ error: { status: 403, reason: "UNKNOWN" } }, 403);
    player.deviceId = device.id;
    return device;
  }

  function play(body: Record<string, unknown>): Response | null {
    if (typeof body.context_uri === "string") {
      const [, kind, id] = body.context_uri.split(":");
      const ids = kind === "playlist" ? playlists.get(id)?.trackIds
        : kind === "album" ? [...tracks.values()].filter(t => t.albumId === id).map(t => t.id) : undefined;
      if (!ids?.length) return json({ error: { status: 404, message: "Context not found" } }, 404);
      const offset = body.offset as { position?: number; uri?: string } | undefined;
      let index = offset?.position ?? 0;
      if (offset?.uri) index = ids.indexOf(offset.uri.replace("spotify:track:", ""));
      if (index < 0 || index >= ids.length) return json({ error: { status: 400, message: "Invalid offset" } }, 400);
      let order = [...ids];
      if (player.shuffle) {
        // Shuffled: the requested song first, the rest in another order
        const [first] = order.splice(index, 1);
        order = [first, ...order.reverse()];
        index = 0;
      }
      player.contextUri = body.context_uri;
      player.contextIds = ids;
      player.order = order;
      player.index = index;
      plays.push(`${body.context_uri}@${offset?.uri ?? index}`);
    } else if (Array.isArray(body.uris)) {
      player.contextUri = null;
      player.order = (body.uris as string[]).map(u => u.replace("spotify:track:", ""));
      player.contextIds = player.order;
      player.index = 0;
      plays.push(`uris@${player.order[0]}`);
    } else if (!current()) {
      return json({ error: { status: 404, message: "No track" } }, 404);
    }
    if (body.context_uri || body.uris) player.progressMs = typeof body.position_ms === "number" ? body.position_ms : 0;
    setPlaying(true);
    return null;
  }

  async function handle(url: URL, method: string, body: Record<string, unknown>): Promise<Response> {
    const path = url.pathname.replace(/^\/v1/, "");
    let m: RegExpMatchArray | null;

    if (method === "GET" && path === "/me") return json({ id: USER, display_name: USER });
    if (method === "GET" && path === "/me/player") {
      if (pendingShuffle && --pendingShuffle.reads <= 0) { applyShuffle(pendingShuffle.value); pendingShuffle = null; }
      const isPlaying = reported.reads > 0 ? reported.isPlaying : player.isPlaying;
      if (reported.reads > 0) reported.reads--;
      const t = current();
      if (!player.deviceId || !t) return empty();
      return json({
        is_playing: isPlaying, progress_ms: player.progressMs, shuffle_state: player.shuffle,
        device: deviceJson(devices.find(d => d.id === player.deviceId)!),
        context: player.contextUri ? { uri: player.contextUri } : null,
        item: trackJson(t),
      });
    }
    if (method === "GET" && path === "/me/player/devices") return json({ devices: devices.map(deviceJson) });
    if (method === "PUT" && path === "/me/player") {
      const id = (body.device_ids as string[] | undefined)?.[0];
      const device = devices.find(d => d.id === id);
      if (!device) return json({ error: { status: 404 } }, 404);
      device.dormant = false; // a transfer wakes the device
      player.deviceId = device.id;
      if (body.play) setPlaying(!!current());
      return empty();
    }
    if (method === "PUT" && path === "/me/player/play") {
      const device = target(url);
      if (device instanceof Response) return device;
      return play(body) ?? empty();
    }
    if (method === "PUT" && path === "/me/player/pause") {
      const device = target(url);
      if (device instanceof Response) return device;
      if (!player.isPlaying) return json({ error: { status: 403, reason: "UNKNOWN" } }, 403);
      setPlaying(false);
      return empty();
    }
    if (method === "PUT" && path === "/me/player/seek") {
      player.progressMs = Number(url.searchParams.get("position_ms"));
      return empty();
    }
    if (method === "PUT" && path === "/me/player/shuffle") {
      const value = url.searchParams.get("state") === "true";
      if (lag) pendingShuffle = { value, reads: lag };
      else applyShuffle(value);
      return empty();
    }
    if (method === "GET" && path === "/me/player/queue") {
      const t = current();
      const next = player.order.slice(player.index + 1, player.index + 1 + QUEUE_LENGTH).map(id => tracks.get(id)!);
      const queue = [...next, ...autoplay].slice(0, QUEUE_LENGTH);
      return json({ currently_playing: t ? trackJson(t) : null, queue: t ? queue.map(trackJson) : [] });
    }
    if (method === "GET" && path === "/me/playlists") {
      return json({ items: [...playlists.values()].filter(p => p.own).map(playlistJson) });
    }
    if (method === "GET" && (m = path.match(/^\/playlists\/(\w+)\/items$/))) {
      const p = playlists.get(m[1]);
      if (!p) return json({ error: { status: 404 } }, 404);
      if (!p.own) return json({ href: url.href }); // Development mode: no items for foreign playlists
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const page = p.trackIds.slice(offset, offset + limit).map(id => ({ item: trackJson(tracks.get(id)!) }));
      const nextOffset = offset + limit;
      return json({ items: page, next: nextOffset < p.trackIds.length ? `https://api.spotify.com/v1/playlists/${p.id}/items?offset=${nextOffset}&limit=${limit}` : null });
    }
    if (method === "GET" && (m = path.match(/^\/playlists\/(\w+)$/))) {
      const p = playlists.get(m[1]);
      return p ? json(playlistJson(p)) : json({ error: { status: 404 } }, 404);
    }
    if (method === "GET" && (m = path.match(/^\/tracks\/(\w+)$/))) {
      const t = tracks.get(m[1]);
      return t ? json(trackJson(t)) : json({ error: { status: 404 } }, 404);
    }
    if (method === "GET" && path === "/search") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const limit = Number(url.searchParams.get("limit") ?? 10);
      if (url.searchParams.get("type") === "playlist") {
        return json({ playlists: { items: [...playlists.values()].filter(p => p.name.toLowerCase().includes(q)).slice(0, limit).map(playlistJson) } });
      }
      return json({ tracks: { items: [...tracks.values()].filter(t => t.name.toLowerCase().includes(q)).slice(0, limit).map(trackJson) } });
    }
    return json({ error: { status: 404, message: `Sim: ${method} ${path} not implemented` } }, 404);
  }

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "api.spotify.com") return empty(503);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname.replace(/^\/v1/, "")}${url.search}`);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return handle(url, method, body);
  };

  /** Time passes: the device applies and reports everything still pending. */
  const settle = () => {
    if (pendingShuffle) { applyShuffle(pendingShuffle.value); pendingShuffle = null; }
    reported.reads = 0;
  };

  return { fetch: fetchImpl, player, devices, playlists, tracks, calls, plays, current, settle };
}

export type SpotifySim = ReturnType<typeof createSpotifySim>;
