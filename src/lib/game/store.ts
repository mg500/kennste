import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { refreshSpotifyToken, type SpotifyTokens } from "../auth";
import { logEvent, stopwatch } from "../log";
import { hostKey, markPlayed, playedSongs } from "../playedSongs";
import { scanPlaylistQueue } from "../playlists";
import { musicBrainzDown, withOriginalYear } from "../releaseYear";
import { fetchPlayback, fetchPlayerState, runEffect, sleep } from "../spotify";
import { getMode, type ModeId } from "./modes";
import { addPlayer, applyAction, CONTINUE_COUNTDOWN_SEC, continuingPlayer, newGame } from "./reducer";
import type { Action, Effect, Game, GameEvent, Playback, PlaybackDevice, Track } from "./types";
import { viewFor, type ViewerId } from "./view";

type Listener = (event: GameEvent) => void;
/** A connected device and who looks through it (see viewFor). */
interface Subscriber { listener: Listener; viewer: ViewerId }

// In-memory server state. Secrets (Spotify credentials, player tokens) are kept outside the Game
// object; each device only gets its own view of it (see viewFor).
interface GameEntry {
  game: Game;
  lastActivity: number;
  hostAuth?: SpotifyTokens;
  pendingRefresh?: Promise<string | null>;
  playlist?: Track[];
  /** Foreign playlists are read block by block through the playback queue, see loadMoreSongs. */
  playlistSource?: PlaylistSource;
  loadingSongs?: Promise<void>;
  playerTokens: Map<string, string>; // token → playerId
  listeners: Set<Subscriber>;
  /** Key for the stand-ins of the running song's Spotify ID in what devices see (see maskOf). */
  maskKey: Buffer;
  playback?: Playback;
  poller?: NodeJS.Timeout;
  playLimitTimer?: NodeJS.Timeout;
  /** The round's song was last seen playing close to its end (its ID), and the pause right before it, see watchSongEnd. */
  songEnding?: string;
  songEndTimer?: NodeJS.Timeout;
  polling?: boolean;
  enrichingYears?: boolean;
  screens: number;
  /** Continues the game when the countdown of a continue vote ends, see scheduleContinue. */
  continueTimer?: { countdownAt: number; timer: NodeJS.Timeout };
  /** Ends the round when the mode's deadline is reached, see scheduleDeadline. */
  deadlineTimer?: { at: number; timer: NodeJS.Timeout };
  /** The playlist the evening's songs were saved to (see setSavedPlaylist). */
  savedPlaylistId?: string;
  /** Songs everyone heard before: in the lobby, or for a moment while the playlist was read. They come later (see freshFirst). */
  heardBefore: Set<string>;
  /** Who hosts, for the songs their earlier games played (see playedSongs.ts); none without a login (tests). */
  hostKey?: string;
  /** Songs this lobby's games played and when, and the running round's song once noted (see notePlayed). */
  played: Map<string, number>;
  notedTrackId?: string;
  /** Starts the game when the start countdown ends, see scheduleStart. */
  startTimer?: { endsAt: number; timer: NodeJS.Timeout };
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

/**
 * Stands in for a Spotify ID in what devices see during a game: the same ID always gets the same stand-in (so the
 * playback bar still finds the running song), but it can't be looked up on Spotify.
 */
function maskOf(entry: GameEntry): (trackId: string) => string {
  return trackId => createHmac("sha256", entry.maskKey).update(trackId).digest("base64url").slice(0, 22);
}

/** What `viewer` may see of the game (see viewFor). */
function viewOf(entry: GameEntry, viewer: ViewerId): Game {
  return viewFor(entry.game, viewer, maskOf(entry));
}

/** The playback state as devices see it: during a game with the song's stand-in instead of its Spotify ID. */
function playbackView(entry: GameEntry, playback: Playback): Playback {
  return entry.game.status === "playing" && playback.trackId ? { ...playback, trackId: maskOf(entry)(playback.trackId) } : playback;
}

function publish(entry: GameEntry, event: GameEvent) {
  // Each device gets its own view of the game; devices of the same player (or all spectators) share one
  const views = new Map<ViewerId, Game>();
  const viewOnce = (viewer: ViewerId) => views.get(viewer) ?? views.set(viewer, viewOf(entry, viewer)).get(viewer)!;
  const shared = event.type === "playback" ? { type: event.type, playback: playbackView(entry, event.playback) } : event;
  for (const { listener, viewer } of entry.listeners) listener(shared.type === "game" ? { type: "game", game: viewOnce(viewer) } : shared);
}

/** Stores a new game state and broadcasts it to all subscribers. */
function commit(entry: GameEntry, game: Game) {
  entry.game = { ...game, version: entry.game.version + 1 };
  entry.lastActivity = Date.now();
  publish(entry, { type: "game", game: entry.game });
  notePlayed(entry);
  scheduleContinue(entry);
  scheduleDeadline(entry);
  scheduleStart(entry);
}

/** The full game state – server only; devices get `gameView`. */
export function getGame(id: string): Game | undefined {
  return store.entries.get(id)?.game;
}

/** The game as `viewer` (a player ID, or null for a spectator) may see it right now. */
export function gameView(id: string, viewer: ViewerId): Game | undefined {
  const entry = store.entries.get(id);
  return entry && viewOf(entry, viewer);
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
    clearTimeout(entry.songEndTimer);
    clearTimeout(entry.continueTimer?.timer);
    clearTimeout(entry.deadlineTimer?.timer);
    clearTimeout(entry.startTimer?.timer);
    publish(entry, { type: "deleted" });
    entry.listeners.clear();
  }
}

/** Tests: removes every game with its timers, so a delayed poll of one test can't reach the next one's Spotify. */
export function deleteAllGames() {
  for (const id of [...store.entries.keys()]) deleteGame(id);
}

function join(entry: GameEntry, name: string): { playerId: string; token: string } | null {
  if (entry.game.closedAt) return null;
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
    playerTokens: new Map(), listeners: new Set(), maskKey: randomBytes(16), screens: 0, heardBefore: new Set(),
    played: new Map(), ...(userId ? { hostKey: hostKey(userId) } : {}),
  };
  store.entries.set(id, entry);
  const host = join(entry, hostName)!;
  if (userId) store.hostSessions.set(userId, { gameId: id, ...host });
  return { game: viewOf(entry, host.playerId), ...host };
}

/**
 * The host closes the lobby. Once a game was played, everyone gets the evening's summary (the game stays until it
 * is cleaned up as idle; the host can still save the songs); otherwise it is simply deleted. Resolves to whether
 * the game was kept.
 */
export async function closeGame(id: string): Promise<boolean> {
  const entry = store.entries.get(id);
  if (!entry) return false;
  if (!entry.game.evening?.games.length && !entry.game.history?.length) {
    deleteGame(id);
    return false;
  }
  const result = await dispatch(id, entry.game.hostPlayerId, { type: "close" });
  // The host can start a new game right away
  for (const [userId, s] of store.hostSessions) if (s.gameId === id) store.hostSessions.delete(userId);
  return result.ok;
}

export function joinGame(id: string, name: string) {
  const entry = store.entries.get(id);
  if (!entry) return null;
  const result = join(entry, name);
  return result && { game: viewOf(entry, result.playerId), ...result };
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
      if (entry.playlist === list && replaceTrack(list, updated)) trackUpdated(entry, updated);
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
    if (updated && entry.playlist === list) replaceTrack(list, updated);
  }
}

/**
 * Puts a song back after looking up its year – where it is now: the start may have reordered the list meanwhile
 * (`freshFirst`), and the old position would overwrite another song, possibly the running round's.
 */
function replaceTrack(list: Track[], track: Track): boolean {
  const index = list.findIndex(t => t.id === track.id);
  if (index < 0) return false;
  list[index] = track;
  return true;
}

/** Looks up the original release year of a song a player picked and corrects it in the running round. */
async function verifyPickedTrack(gameId: string, track: Track) {
  const entry = store.entries.get(gameId);
  if (!entry || track.yearVerified) return;
  const updated = await withOriginalYear(track, { urgent: true });
  if (store.entries.get(gameId) === entry) trackUpdated(entry, updated);
}

export function setPlaylist(
  id: string, info: { id: string; name: string; image: string | null }, tracks: Track[], source?: PlaylistSource, heard: string[] = [],
): Game | null {
  const entry = store.entries.get(id);
  if (!entry) return null;
  for (const trackId of heard) entry.heardBefore.add(trackId);
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

/** The running round's song counts as played – for this lobby and for the host's later games. */
function notePlayed(entry: GameEntry) {
  const { game } = entry;
  const trackId = game.status === "playing" ? getMode(game.mode.id).currentTrackId(game.mode) : undefined;
  if (!trackId || trackId === entry.notedTrackId) return;
  entry.notedTrackId = trackId;
  const now = Date.now();
  entry.played.set(trackId, now);
  if (entry.hostKey) markPlayed(entry.hostKey, [trackId], now);
}

/** When a song last played in this lobby or in one of the host's earlier games, if it did. */
function playedAtOf(entry: GameEntry): (trackId: string) => number | undefined {
  const before = entry.hostKey ? playedSongs(entry.hostKey) : new Map<string, number>();
  return trackId => entry.played.get(trackId) ?? before.get(trackId);
}

/**
 * Songs left that no earlier game played: when these run low, more of a foreign playlist is read. (The few heard in
 * the lobby don't count against it – reading a block more just for them would interrupt the music once more.)
 */
function freshLeft(entry: GameEntry): number {
  const playedAt = playedAtOf(entry);
  return (entry.playlist ?? []).slice((entry.game.playlistIndex ?? -1) + 1).filter(t => playedAt(t.id) === undefined).length;
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
  if (source?.blocks.length && freshLeft(entry) < min) {
    entry.loadingSongs = (async () => {
      commit(entry, { ...entry.game, playlistLoading: true });
      try {
        const token = await getHostToken(gameId);
        while (token && source.blocks.length && freshLeft(entry) < min && entry.playlistSource === source) {
          const position = source.blocks.shift()!;
          const { tracks, heard } = await scanPlaylistQueue(token, source.playlistId, [position], { deviceId: entry.game.device?.id, total: source.total });
          const known = new Set([...entry.playlist!.map(t => t.id), ...getMode(entry.game.mode.id).usedTrackIds(entry.game.mode)]);
          // The song that played for a moment while reading comes last, so nobody knows it from just now
          const fresh = tracks.filter(t => !known.has(t.id));
          for (const trackId of heard) entry.heardBefore.add(trackId);
          entry.playlist!.push(...shuffled(fresh));
          freshFirst(entry);
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

/**
 * What plays in the lobby right now counts as heard, too: the lobby looks at it only every few seconds, and the song
 * may have changed just before the start.
 */
async function noteLobbySong(entry: GameEntry) {
  const token = await getHostToken(entry.game.id);
  const state = token ? await fetchPlayerState(token) : null;
  if (state?.track) entry.heardBefore.add(state.track.id);
}

/**
 * The songs still to come, fresh ones first: then those everyone heard before (the picked playlist plays on in the
 * lobby), and last those an earlier game of this lobby or of the host played, the longest ago first. So a playlist
 * played again only repeats songs once it has no new ones left. In place: background lookups still hold the list.
 */
function freshFirst(entry: GameEntry) {
  const list = entry.playlist;
  if (!list) return;
  const playedAt = playedAtOf(entry);
  const from = (entry.game.playlistIndex ?? -1) + 1;
  const rest = list.slice(from);
  const played = rest.filter(t => playedAt(t.id) !== undefined).sort((a, b) => playedAt(a.id)! - playedAt(b.id)!);
  const heard = rest.filter(t => playedAt(t.id) === undefined && entry.heardBefore.has(t.id));
  const fresh = rest.filter(t => playedAt(t.id) === undefined && !entry.heardBefore.has(t.id));
  list.splice(from, rest.length, ...fresh, ...heard, ...played);
}

/** Sets the device the music plays on; undefined → the host's active Spotify device. */
export function setDevice(id: string, device: PlaybackDevice | undefined): Game | null {
  const entry = store.entries.get(id);
  if (!entry) return null;
  commit(entry, { ...entry.game, device });
  return entry.game;
}

/** The playlist of the evening's songs: `songs` of them are in it now. */
export function setSavedPlaylist(id: string, playlist: { id: string; url: string }, songs: number): Game | null {
  const entry = store.entries.get(id);
  if (!entry) return null;
  entry.savedPlaylistId = playlist.id;
  commit(entry, { ...entry.game, savedPlaylist: { url: playlist.url, songs } });
  return entry.game;
}

/** Spotify ID of the evening's playlist, to add the songs of later games to it. */
export function getSavedPlaylistId(id: string): string | undefined {
  return store.entries.get(id)?.savedPlaylistId;
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
      watchSongEnd(gameId, entry, currentTrackId, playback);
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
    if (track && state.isPlaying) entry.heardBefore.add(track.id);
    entry.playback = playback;
    publish(entry, { type: "playback", playback });
  } finally {
    entry.polling = false;
  }
}

/** Lead time before the end of a song: the pause has to arrive before Spotify moves on. */
const SONG_END_LEAD_MS = 700;

/** How close to its end a song has to be seen for the server to count on Spotify moving on. */
const SONG_END_WINDOW_MS = PLAYBACK_POLL_MS + 1000;

/**
 * A song started through its album is followed by the album's next song (or autoplay) – during a round that would
 * be a stranger in the game, or sound like the next round already started. So the server pauses right before the
 * round's song ends, and pauses anyway if Spotify moved on right after the song was seen close to its end. Other
 * music someone puts on by hand isn't touched.
 */
function watchSongEnd(gameId: string, entry: GameEntry, trackId: string, playback: Playback) {
  clearTimeout(entry.songEndTimer);
  entry.songEndTimer = undefined;
  if (playback.trackId === trackId) {
    const left = playback.durationMs - playback.progressMs;
    const ending = playback.isPlaying && playback.durationMs > 0 && left <= SONG_END_WINDOW_MS;
    entry.songEnding = ending ? trackId : undefined;
    if (ending) entry.songEndTimer = setTimeout(() => void pauseRound(gameId, entry, trackId), Math.max(0, left - SONG_END_LEAD_MS));
  } else if (playback.isPlaying && playback.trackId && entry.songEnding === trackId) {
    entry.songEnding = undefined;
    logEvent("songEnded", { game: gameId });
    void pauseRound(gameId, entry, trackId);
  }
}

/** Pauses the music, as long as the round still plays `trackId`. */
async function pauseRound(gameId: string, entry: GameEntry, trackId: string) {
  if (store.entries.get(gameId) !== entry || getMode(entry.game.mode.id).currentTrackId(entry.game.mode) !== trackId) return;
  const token = await getHostToken(gameId);
  if (token) await runEffect(token, { type: "pause" }, entry.game.device?.id);
  setTimeout(() => void pollPlayback(gameId), 500);
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
export function subscribe(gameId: string, listener: Listener, opts: { screen?: boolean; viewer?: ViewerId } = {}): (() => void) | null {
  const entry = store.entries.get(gameId);
  if (!entry) return null;
  const subscriber: Subscriber = { listener, viewer: opts.viewer ?? null };
  entry.listeners.add(subscriber);
  listener({ type: "game", game: viewOf(entry, subscriber.viewer) });
  if (entry.playback) listener({ type: "playback", playback: playbackView(entry, entry.playback) });
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
    entry.listeners.delete(subscriber);
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

// ── Start countdown ──────────────────────────────────────────────────────────

/**
 * Starts the game when the start countdown ends – the server does it, so no phone can hold it up. Meanwhile the
 * songs are read and the first years checked, so the first song plays right away; should that take longer,
 * the start waits for it.
 */
function scheduleStart(entry: GameEntry) {
  const endsAt = entry.game.status === "lobby" ? entry.game.countdown?.endsAt : undefined;
  if (entry.startTimer?.endsAt === endsAt) return;
  clearTimeout(entry.startTimer?.timer);
  entry.startTimer = undefined;
  if (endsAt === undefined) return;
  const gameId = entry.game.id;
  let prepared: Promise<void> = Promise.resolve();
  const timer = setTimeout(async () => {
    await prepared;
    if (store.entries.get(gameId) !== entry || entry.game.countdown?.endsAt !== endsAt) return;
    const result = await dispatch(gameId, entry.game.hostPlayerId, { type: "start" });
    // Can't start after all (e.g. everyone else left): back to the lobby
    if (!result.ok && entry.game.countdown?.endsAt === endsAt) commit(entry, { ...entry.game, countdown: undefined });
  }, Math.max(0, endsAt - Date.now()));
  // Set before preparing: that commits progress, which comes back here
  entry.startTimer = { endsAt, timer };
  prepared = prepareStart(entry, endsAt).catch(() => {});
}

/** Reads the songs and checks the first years during the start countdown, and tells everyone how far it got. */
async function prepareStart(entry: GameEntry, endsAt: number) {
  const gameId = entry.game.id;
  const report = (patch: Partial<NonNullable<Game["countdown"]>>) => {
    const { countdown } = entry.game;
    if (store.entries.get(gameId) === entry && countdown?.endsAt === endsAt) commit(entry, { ...entry.game, countdown: { ...countdown, ...patch } });
  };
  if (entry.game.settings.songSource !== "playlist") return;
  await loadMoreSongs(gameId, SONGS_AT_START, true);
  await noteLobbySong(entry);
  freshFirst(entry);
  report({ songs: songsLeft(entry) });
  await verifyUpcoming(entry, songsAtStart(entry.game));
  report({ years: true });
}

/** Songs a game starts with: the first song, and the start cards of the timeline modes. */
function songsAtStart(game: Game): number {
  return 1 + (getMode(game.mode.id).startCards?.(game, game.mode) ?? 0);
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** Devices only know the running song by its stand-in (see maskOf): "play it again" names it that way. */
function unmask(entry: GameEntry, trackId: string): string {
  const current = getMode(entry.game.mode.id).currentTrackId(entry.game.mode);
  return current && maskOf(entry)(current) === trackId ? current : trackId;
}

/**
 * "Play this track" (the play button) for the track Spotify already has loaded means resume — don't restart it from
 * the beginning. Only for the button: a new round always starts its song, even if it happens to be loaded already.
 */
function resumeIfLoaded(entry: GameEntry, action: Action, effect: Effect): Effect {
  return action.type === "play" && effect.type === "play" && effect.trackId && effect.trackId === entry.playback?.trackId ? { type: "play" } : effect;
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
  // Preparing a song change reads songs on the host's device: only for an action that would be accepted
  if (songChange) {
    const check = applyAction(entry.game, actorId, action, { now: Date.now(), random: Math.random, playlist: entry.playlist });
    if (!check.ok) return check;
  }
  if (action.type === "start" && entry.game.status === "lobby") {
    await watch.time("songs", () => loadMoreSongs(gameId, SONGS_AT_START, true));
    if (entry.game.settings.songSource === "playlist") await noteLobbySong(entry);
    freshFirst(entry);
    await watch.time("years", () => verifyUpcoming(entry, songsAtStart(entry.game)));
  } else if ((action.type === "next" || action.type === "redraw") && entry.game.status === "playing") {
    await watch.time("songs", () => loadMoreSongs(gameId, SONGS_AHEAD, false));
    await watch.time("years", () => verifyUpcoming(entry, 2));
  }
  if (action.type === "play" && action.trackId) action = { ...action, trackId: unmask(entry, action.trackId) };
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
      spotifyError ??= await watch.time("play", () => runEffect(token, resumeIfLoaded(entry, action, effect), game.device?.id));
    }
    // Give Spotify a moment to apply the change, then push the new playback state to everyone
    setTimeout(() => void pollPlayback(gameId), 500);
  }
  if (songChange) logEvent("songChange", { game: gameId, action: action.type, ms: watch.ms, totalMs: watch.total(), ...(spotifyError ? { spotifyError } : {}) });
  return { ok: true, game, spotifyError };
}
