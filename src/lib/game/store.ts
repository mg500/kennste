import { randomBytes, randomUUID } from "node:crypto";
import { refreshSpotifyToken, type SpotifyTokens } from "../auth";
import { logEvent, stopwatch } from "../log";
import { scanPlaylistQueue } from "../playlists";
import { musicBrainzDown, withOriginalYear } from "../releaseYear";
import { fetchPlayback, fetchPlayerState, runEffect, sleep } from "../spotify";
import { getMode, type ModeId } from "./modes";
import { addPlayer, applyAction, CONTINUE_COUNTDOWN_SEC, continuingPlayer, newGame } from "./reducer";
import type { Action, Effect, Game, GameEvent, Playback, PlaybackDevice, Track } from "./types";

type Listener = (event: GameEvent) => void;

// In-memory server state. Secrets (Spotify credentials, player tokens) are kept outside the Game
// object, which is sent to every client as-is.
interface GameEntry {
  game: Game;
  lastActivity: number;
  hostAuth?: SpotifyTokens;
  pendingRefresh?: Promise<string | null>;
  playlist?: Track[];
  /** Foreign playlists are read block by block through the playback queue, see loadMoreSongs. */
  playlistSource?: PlaylistSource;
  /** Picked during the game, takes over with the next song (see switchPlaylist). */
  pendingPlaylist?: { info: { id: string; name: string; image: string | null }; tracks: Track[]; source?: PlaylistSource };
  loadingSongs?: Promise<void>;
  playerTokens: Map<string, string>; // token → playerId
  listeners: Set<Listener>;
  playback?: Playback;
  poller?: NodeJS.Timeout;
  playLimitTimer?: NodeJS.Timeout;
  polling?: boolean;
  enrichingYears?: boolean;
  screens: number;
  /** Continues the game when the countdown of a continue vote ends, see scheduleContinue. */
  continueTimer?: { countdownAt: number; timer: NodeJS.Timeout };
  /** Ends the round when the mode's deadline is reached, see scheduleDeadline. */
  deadlineTimer?: { at: number; timer: NodeJS.Timeout };
}

interface PlaylistSource {
  playlistId: string;
  /** Number of songs, if known. */
  total?: number;
  /** Queue positions not read yet. */
  blocks: number[];
}

interface HostSession { gameId: string; playerId: string; token: string }

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const PLAYBACK_POLL_MS = 3000;

interface Store { entries: Map<string, GameEntry>; hostSessions: Map<string, HostSession>; sweeper?: NodeJS.Timeout }

// Kept on globalThis so state survives hot reloads in dev
const g = globalThis as typeof globalThis & { __gameStore__?: Store };
const store: Store = (g.__gameStore__ ??= { entries: new Map(), hostSessions: new Map() });
store.sweeper ??= setInterval(() => {
  const cutoff = Date.now() - IDLE_TIMEOUT_MS;
  for (const [id, entry] of store.entries) if (entry.lastActivity < cutoff) deleteGame(id);
}, 10 * 60 * 1000);
store.sweeper.unref?.();

function newGameId(): string {
  let id: string;
  do id = randomBytes(4).readUInt32BE().toString(36).padStart(6, "0").slice(-6);
  while (store.entries.has(id));
  return id;
}

function publish(entry: GameEntry, event: GameEvent) {
  for (const listener of entry.listeners) listener(event);
}

/** Stores a new game state and broadcasts it to all subscribers. */
function commit(entry: GameEntry, game: Game) {
  entry.game = { ...game, version: entry.game.version + 1 };
  entry.lastActivity = Date.now();
  publish(entry, { type: "game", game: entry.game });
  scheduleContinue(entry);
  scheduleDeadline(entry);
}

export function getGame(id: string): Game | undefined {
  return store.entries.get(id)?.game;
}

/** The game's loaded playlist (server only – it holds the songs' titles and years). */
export function getPlaylist(id: string): Track[] | undefined {
  return store.entries.get(id)?.playlist;
}

export function deleteGame(id: string) {
  const entry = store.entries.get(id);
  store.entries.delete(id);
  for (const [userId, s] of store.hostSessions) if (s.gameId === id) store.hostSessions.delete(userId);
  if (entry) {
    clearInterval(entry.poller);
    clearTimeout(entry.playLimitTimer);
    clearTimeout(entry.continueTimer?.timer);
    clearTimeout(entry.deadlineTimer?.timer);
    publish(entry, { type: "deleted" });
    entry.listeners.clear();
  }
}

function join(entry: GameEntry, name: string): { playerId: string; token: string } | null {
  const playerId = randomUUID().slice(0, 8);
  const game = addPlayer(entry.game, { id: playerId, name, joinedAt: Date.now() });
  if (!game) return null;
  const token = randomUUID();
  entry.playerTokens.set(token, playerId);
  commit(entry, game);
  return { playerId, token };
}

export function createGame(hostName: string, hostAuth: SpotifyTokens | undefined, userId: string | null, mode: ModeId = "buzzer", device?: PlaybackDevice) {
  const id = newGameId();
  const entry: GameEntry = {
    game: { ...newGame(id, Date.now(), mode), ...(device ? { device } : {}) }, lastActivity: Date.now(), hostAuth,
    playerTokens: new Map(), listeners: new Set(), screens: 0,
  };
  store.entries.set(id, entry);
  const host = join(entry, hostName)!;
  if (userId) store.hostSessions.set(userId, { gameId: id, ...host });
  return { game: entry.game, ...host };
}

export function joinGame(id: string, name: string) {
  const entry = store.entries.get(id);
  if (!entry) return null;
  const result = join(entry, name);
  return result && { game: entry.game, ...result };
}

export function getHostSession(userId: string): HostSession | undefined {
  const s = store.hostSessions.get(userId);
  if (s && !store.entries.has(s.gameId)) {
    store.hostSessions.delete(userId);
    return undefined;
  }
  return s;
}

/** Resolves a player token to a player that is still part of the game (kicked players are rejected). */
export function resolvePlayer(gameId: string, token: string | null): string | null {
  const entry = store.entries.get(gameId);
  const playerId = token ? entry?.playerTokens.get(token) : undefined;
  if (!entry || !playerId) return null;
  const { players, viewerPlayers } = entry.game;
  return players.some(p => p.id === playerId) || viewerPlayers?.some(p => p.id === playerId) ? playerId : null;
}

/** Passes over the playlist when MusicBrainz couldn't be asked for some songs, and the pause between them. */
const YEAR_PASSES = 3;
const YEAR_RETRY_MS = 30_000;

/**
 * Corrects the playlist's release years to the original release (MusicBrainz, ~1 song/s) in the
 * background — the current and upcoming songs first. Songs MusicBrainz couldn't answer for (offline,
 * rate limit) are tried again in a later pass. Stops when the game or playlist goes away.
 */
async function enrichYears(gameId: string) {
  const entry = store.entries.get(gameId);
  if (!entry || entry.enrichingYears) return;
  entry.enrichingYears = true;
  try {
    const failed = new Set<string>();
    for (let pass = 1; store.entries.get(gameId) === entry && entry.playlist;) {
      const list = entry.playlist;
      const from = entry.game.playlistIndex ?? 0;
      let index = -1;
      for (let k = 0; k < list.length; k++) {
        const i = (from + k) % list.length;
        if (!list[i].yearVerified && !failed.has(list[i].id)) { index = i; break; }
      }
      if (index < 0) {
        if (!failed.size || pass >= YEAR_PASSES) break;
        await sleep(YEAR_RETRY_MS);
        failed.clear();
        pass++;
        continue;
      }
      const updated = await withOriginalYear(list[index]);
      if (!updated.yearVerified) failed.add(updated.id);
      if (entry.playlist === list) {
        list[index] = updated;
        trackUpdated(entry, updated);
      }
    }
  } finally {
    entry.enrichingYears = false;
  }
}

/** Lets the mode update its copy of a song whose details changed (e.g. the corrected year of the running round). */
function trackUpdated(entry: GameEntry, track: Track) {
  const mode = getMode(entry.game.mode.id);
  if (!mode.trackUpdated) return;
  const data = structuredClone(entry.game.mode);
  if (mode.trackUpdated(data, track)) commit(entry, { ...entry.game, mode: data });
}

/** How long a round waits at most for the original release years of its songs. */
const YEAR_WAIT_MS = 5000;

/**
 * Makes sure the next songs of the playlist have their original release year before a round starts with them
 * (usually the background lookup is long done). At game start that is enough for the start cards as well.
 */
async function verifyUpcoming(entry: GameEntry, count: number) {
  const list = entry.playlist;
  if (!list || entry.game.settings.songSource !== "playlist") return;
  const until = Date.now() + YEAR_WAIT_MS;
  const from = (entry.game.playlistIndex ?? -1) + 1;
  for (let i = from; i < Math.min(list.length, from + count) && Date.now() < until; i++) {
    if (list[i].yearVerified) continue;
    if (musicBrainzDown()) return; // the background lookup tries again later
    let timer: NodeJS.Timeout | undefined;
    const updated = await Promise.race([
      withOriginalYear(list[i], { urgent: true }),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), until - Date.now()); }),
    ]);
    clearTimeout(timer);
    if (updated && entry.playlist === list) list[i] = updated;
  }
}

/** Looks up the original release year of a song a player picked and corrects it in the running round. */
async function verifyPickedTrack(gameId: string, track: Track) {
  const entry = store.entries.get(gameId);
  if (!entry || track.yearVerified) return;
  const updated = await withOriginalYear(track, { urgent: true });
  if (store.entries.get(gameId) === entry) trackUpdated(entry, updated);
}

export function setPlaylist(
  id: string, info: { id: string; name: string; image: string | null }, tracks: Track[], source?: PlaylistSource,
): Game | null {
  const entry = store.entries.get(id);
  if (!entry) return null;
  entry.playlist = shuffled(tracks);
  entry.playlistSource = source?.blocks.length ? source : undefined;
  void enrichYears(id);
  commit(entry, {
    ...entry.game,
    settings: { ...entry.game.settings, playlistId: info.id },
    playlistTrackCount: tracks.length,
    playlistInfo: { name: info.name, image: info.image },
    playlistIndex: undefined,
  });
  return entry.game;
}

/**
 * The host picked another playlist during the game: it takes over with the next song, so the running round keeps
 * its song. A foreign playlist is only read then (through the queue, which changes the music anyway).
 */
export function queuePlaylist(
  id: string, info: { id: string; name: string; image: string | null }, tracks: Track[], source?: PlaylistSource,
): Game | null {
  const entry = store.entries.get(id);
  if (!entry) return null;
  entry.pendingPlaylist = { info, tracks, source };
  commit(entry, { ...entry.game, pendingPlaylist: { name: info.name, image: info.image } });
  return entry.game;
}

/** Songs that already ran in this game (or lie in a timeline), so a new playlist doesn't bring them back. */
function playedIds(game: Game): Set<string> {
  const mode = game.mode as { played?: string[]; timelines?: Record<string, { trackId: string }[]>; round?: { trackId?: string } };
  return new Set([
    ...(mode.played ?? []),
    ...Object.values(mode.timelines ?? {}).flat().map(c => c.trackId),
    ...(mode.round?.trackId ? [mode.round.trackId] : []),
  ]);
}

/** Puts a playlist picked during the game in place, before the next song is drawn. */
function switchPlaylist(gameId: string) {
  const entry = store.entries.get(gameId);
  const next = entry?.pendingPlaylist;
  if (!entry || !next) return;
  entry.pendingPlaylist = undefined;
  const played = playedIds(entry.game);
  entry.playlist = shuffled(next.tracks.filter(t => !played.has(t.id)));
  entry.playlistSource = next.source?.blocks.length ? next.source : undefined;
  commit(entry, {
    ...entry.game,
    settings: { ...entry.game.settings, playlistId: next.info.id },
    playlistInfo: { name: next.info.name, image: next.info.image },
    playlistTrackCount: next.source?.total ?? next.tracks.length,
    playlistIndex: undefined,
    pendingPlaylist: undefined,
  });
  void enrichYears(gameId);
}

function shuffled<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Songs that should be left over before a game starts or the next round begins. */
const SONGS_AT_START = 30;
const SONGS_AHEAD = 3;

function songsLeft(entry: GameEntry): number {
  return (entry.playlist?.length ?? 0) - 1 - (entry.game.playlistIndex ?? -1);
}

/**
 * Makes sure enough unplayed songs are left by reading further blocks of a foreign playlist. This changes the
 * music on the device for a moment, so it only runs when the music changes anyway (game start, next round).
 * Before a game starts, a playlist that cannot provide enough new songs starts over, freshly shuffled.
 */
async function loadMoreSongs(gameId: string, min: number, starting: boolean) {
  const entry = store.entries.get(gameId);
  if (!entry?.playlist || entry.game.settings.songSource !== "playlist") return;
  while (entry.loadingSongs) await entry.loadingSongs;
  const source = entry.playlistSource;
  if (source?.blocks.length && songsLeft(entry) < min) {
    entry.loadingSongs = (async () => {
      commit(entry, { ...entry.game, playlistLoading: true });
      try {
        const token = await getHostToken(gameId);
        while (token && source.blocks.length && songsLeft(entry) < min && entry.playlistSource === source) {
          const position = source.blocks.shift()!;
          const { tracks } = await scanPlaylistQueue(token, source.playlistId, [position], { deviceId: entry.game.device?.id, total: source.total });
          const known = new Set([...entry.playlist!.map(t => t.id), ...playedIds(entry.game)]);
          entry.playlist!.push(...shuffled(tracks.filter(t => !known.has(t.id))));
        }
      } finally {
        entry.loadingSongs = undefined;
        if (store.entries.get(gameId) === entry) {
          commit(entry, { ...entry.game, playlistLoading: undefined, playlistTrackCount: entry.playlist?.length });
          void enrichYears(gameId);
        }
      }
    })();
    await entry.loadingSongs;
  }
  if (starting && songsLeft(entry) < min && !entry.playlistSource?.blocks.length) {
    entry.playlist = shuffled(entry.playlist);
    commit(entry, { ...entry.game, playlistIndex: undefined });
  }
}

/** Sets the device the music plays on; undefined → the host's active Spotify device. */
export function setDevice(id: string, device: PlaybackDevice | undefined): Game | null {
  const entry = store.entries.get(id);
  if (!entry) return null;
  commit(entry, { ...entry.game, device });
  return entry.game;
}

/** The host saved the finished game's songs as a playlist: everyone sees the link. */
export function setSavedPlaylist(id: string, url: string): Game | null {
  const entry = store.entries.get(id);
  if (!entry) return null;
  commit(entry, { ...entry.game, savedPlaylist: { url } });
  return entry.game;
}

/** Returns a valid host access token for the game, refreshing it if it is (about to be) expired. */
export async function getHostToken(gameId: string): Promise<string | null> {
  const entry = store.entries.get(gameId);
  const auth = entry?.hostAuth;
  if (!entry || !auth) return null;
  if (Date.now() < auth.expiresAt - 60_000) return auth.accessToken;
  entry.pendingRefresh ??= refreshSpotifyToken(auth.refreshToken)
    .then(tokens => { entry.hostAuth = tokens; return tokens.accessToken; })
    .catch(() => null)
    .finally(() => { entry.pendingRefresh = undefined; });
  return entry.pendingRefresh;
}

// ── Live updates ─────────────────────────────────────────────────────────────

/** Fetches the host's playback state once and broadcasts it. Only runs while a round is active. */
async function pollPlayback(gameId: string) {
  const entry = store.entries.get(gameId);
  if (entry?.game.status === "lobby") return pollLobbyPlayback(gameId, entry);
  if (!entry || entry.polling || entry.game.status !== "playing") return;
  const currentTrackId = getMode(entry.game.mode.id).currentTrackId(entry.game.mode);
  if (!currentTrackId) return;
  entry.polling = true;
  try {
    const token = await getHostToken(gameId);
    const playback = token ? await fetchPlayback(token, currentTrackId) : null;
    if (playback && store.entries.get(gameId) === entry) {
      entry.playback = playback;
      publish(entry, { type: "playback", playback });
      // Let the mode start its timers once the song really plays
      const mode = getMode(entry.game.mode.id);
      if (playback.isPlaying && playback.trackId && mode.onPlaying) {
        const data = structuredClone(entry.game.mode);
        if (mode.onPlaying(data, playback.trackId, Date.now())) {
          commit(entry, { ...entry.game, mode: data });
          schedulePlayLimit(gameId, entry, playback.trackId);
        }
      }
    }
  } finally {
    entry.polling = false;
  }
}

/** In the lobby everyone may see what plays (the "Musik" card, the TV's "Läuft gerade"). */
async function pollLobbyPlayback(gameId: string, entry: GameEntry) {
  if (entry.polling) return;
  entry.polling = true;
  try {
    const token = await getHostToken(gameId);
    const state = token ? await fetchPlayerState(token) : null;
    if (!state || store.entries.get(gameId) !== entry || entry.game.status !== "lobby") return;
    const { track } = state;
    const playback: Playback = {
      trackId: track?.id ?? null,
      isPlaying: state.isPlaying,
      progressMs: state.progressMs,
      durationMs: track?.durationMs ?? 0,
      ...(track ? { track: { name: track.name, artist: track.artist, albumArt: track.albumArt, releaseYear: track.releaseYear } } : {}),
    };
    entry.playback = playback;
    publish(entry, { type: "playback", playback });
  } finally {
    entry.polling = false;
  }
}

/** Fetches the playback state again shortly after the music was changed. */
export function refreshPlayback(gameId: string) {
  setTimeout(() => void pollPlayback(gameId), 600);
}

/** Pauses the song once the mode's play limit (e.g. the buzzer snippet length) is reached. */
function schedulePlayLimit(gameId: string, entry: GameEntry, trackId: string) {
  const ms = getMode(entry.game.mode.id).playLimitMs?.(entry.game.mode);
  clearTimeout(entry.playLimitTimer);
  if (!ms) return;
  entry.playLimitTimer = setTimeout(async () => {
    if (store.entries.get(gameId) !== entry) return;
    const mode = getMode(entry.game.mode.id);
    const data = structuredClone(entry.game.mode);
    if (!mode.onPlayLimit?.(data, trackId)) return;
    commit(entry, { ...entry.game, mode: data });
    const token = await getHostToken(gameId);
    if (token) await runEffect(token, { type: "pause" }, entry.game.device?.id);
    setTimeout(() => void pollPlayback(gameId), 500);
  }, ms);
}

/**
 * Subscribes to game and playback updates. The listener immediately receives the current state.
 * Spotify is polled once per game (not per client) while at least one subscriber is connected.
 */
export function subscribe(gameId: string, listener: Listener, opts: { screen?: boolean } = {}): (() => void) | null {
  const entry = store.entries.get(gameId);
  if (!entry) return null;
  entry.listeners.add(listener);
  listener({ type: "game", game: entry.game });
  if (entry.playback) listener({ type: "playback", playback: entry.playback });
  if (!entry.poller) {
    entry.poller = setInterval(() => void pollPlayback(gameId), PLAYBACK_POLL_MS);
    void pollPlayback(gameId);
  }
  // Big screens are counted so the lobby can show that one is connected
  const countScreens = (delta: number) => {
    entry.screens += delta;
    if (store.entries.get(gameId) === entry) commit(entry, { ...entry.game, connectedScreens: entry.screens });
  };
  if (opts.screen) countScreens(1);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    entry.listeners.delete(listener);
    if (opts.screen) countScreens(-1);
    if (entry.listeners.size === 0) {
      clearInterval(entry.poller);
      entry.poller = undefined;
    }
  };
}

// ── Continue vote ────────────────────────────────────────────────────────────

/**
 * Once a majority of the others wants to continue (`continueVote.countdownAt`), the server continues for the
 * continuing player when the countdown ends — independent of whose phone is still connected.
 */
function scheduleContinue(entry: GameEntry) {
  const countdownAt = entry.game.continueVote?.countdownAt;
  if (entry.continueTimer?.countdownAt === countdownAt) return;
  clearTimeout(entry.continueTimer?.timer);
  entry.continueTimer = undefined;
  if (countdownAt === undefined) return;
  const delay = Math.max(0, countdownAt + CONTINUE_COUNTDOWN_SEC * 1000 - Date.now());
  const timer = setTimeout(() => {
    const { game } = entry;
    const player = continuingPlayer(game);
    if (store.entries.get(game.id) !== entry || game.continueVote?.countdownAt !== countdownAt || !player) return;
    void dispatch(game.id, player.id, { type: "next" });
  }, delay);
  entry.continueTimer = { countdownAt, timer };
}

// ── Round deadline ───────────────────────────────────────────────────────────

/** Slack after a deadline, so answers sent in the last moment still arrive (modes accept them within their grace time). */
const DEADLINE_SLACK_MS = 500;

/**
 * Ends the round when the mode's deadline (e.g. the time to answer) is reached. The server does this itself —
 * a client can't: phones stop running timers when the tab is in the background.
 */
function scheduleDeadline(entry: GameEntry) {
  const { game } = entry;
  const at = game.status === "playing" ? getMode(game.mode.id).deadline?.(game.mode) ?? undefined : undefined;
  if (entry.deadlineTimer?.at === at) return;
  clearTimeout(entry.deadlineTimer?.timer);
  entry.deadlineTimer = undefined;
  if (at === undefined) return;
  const timer = setTimeout(() => {
    if (store.entries.get(game.id) !== entry || entry.deadlineTimer?.at !== at) return;
    entry.deadlineTimer = undefined;
    void dispatch(game.id, entry.game.hostPlayerId, { type: "timeout" });
  }, Math.max(0, at + DEADLINE_SLACK_MS - Date.now()));
  entry.deadlineTimer = { at, timer };
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** "Play this track" for the track Spotify already has loaded means resume — don't restart it from the beginning. */
function resumeIfLoaded(entry: GameEntry, effect: Effect): Effect {
  return effect.type === "play" && effect.trackId && effect.trackId === entry.playback?.trackId ? { type: "play" } : effect;
}

export type DispatchResult =
  | { ok: true; game: Game; spotifyError?: string }
  | { ok: false; error: string; status: number };

export async function dispatch(gameId: string, actorId: string, action: Action): Promise<DispatchResult> {
  const entry = store.entries.get(gameId);
  if (!entry) return { ok: false, error: "Spiel nicht gefunden", status: 404 };
  // How long a new song takes, step by step (see logEvent): reading more songs, checking years, playing
  const watch = stopwatch();
  const songChange = (action.type === "start" && entry.game.status === "lobby")
    || ((action.type === "next" || action.type === "redraw") && entry.game.status === "playing");
  if (action.type === "start" && entry.game.status === "lobby") {
    switchPlaylist(gameId);
    await watch.time("songs", () => loadMoreSongs(gameId, SONGS_AT_START, true));
    // The first song, and the start cards of the timeline modes
    const mode = getMode(entry.game.mode.id);
    await watch.time("years", () => verifyUpcoming(entry, 1 + (mode.startCards?.(entry.game, entry.game.mode as never) ?? 0)));
  } else if ((action.type === "next" || action.type === "redraw") && entry.game.status === "playing" && entry.pendingPlaylist
    // Only when the action goes through: the running round still needs the old playlist
    && applyAction(entry.game, actorId, action, { now: Date.now(), random: Math.random, playlist: entry.playlist }).ok) {
    switchPlaylist(gameId);
    await watch.time("songs", () => loadMoreSongs(gameId, SONGS_AHEAD, false));
    await watch.time("years", () => verifyUpcoming(entry, 2));
  } else if ((action.type === "next" || action.type === "redraw") && entry.game.status === "playing") {
    await watch.time("songs", () => loadMoreSongs(gameId, SONGS_AHEAD, false));
    await watch.time("years", () => verifyUpcoming(entry, 2));
  }
  const result = applyAction(entry.game, actorId, action, { now: Date.now(), random: Math.random, playlist: entry.playlist });
  if (!result.ok) return result;
  commit(entry, result.game);
  const game = entry.game;
  if (action.type === "pickSong") void verifyPickedTrack(gameId, action.track);

  let spotifyError: string | undefined;
  if (result.effects.length) {
    const token = await getHostToken(gameId);
    if (!token) spotifyError = "Host ist nicht mit Spotify verbunden";
    else for (const effect of result.effects) {
      spotifyError ??= await watch.time("play", () => runEffect(token, resumeIfLoaded(entry, effect), game.device?.id));
    }
    // Give Spotify a moment to apply the change, then push the new playback state to everyone
    setTimeout(() => void pollPlayback(gameId), 500);
  }
  if (songChange) logEvent("songChange", { game: gameId, action: action.type, ms: watch.ms, totalMs: watch.total(), ...(spotifyError ? { spotifyError } : {}) });
  return { ok: true, game, spotifyError };
}
