// The songs a host's games played, across games and lobbies: next time they come last (see `freshFirst` in
// store.ts), so a playlist played again brings new songs first. Kept in memory; with DATA_DIR set also in
// DATA_DIR/played-songs.json, so a restart doesn't forget them. Hosts are only known by a hash of their login.
import { createHash } from "node:crypto";
import { accessSync, constants, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { onShutdown } from "./lifecycle";

/** Songs older than that count as fresh again; and at most that many are kept per host (the oldest go first). */
const KEEP_MS = 180 * 24 * 3600_000;
const MAX_PER_HOST = 5000;
/** Changes are written together, at most this often. */
const SAVE_DELAY_MS = 5000;
const FILE = "played-songs.json";

interface FileFormat { version: 1; hosts: Record<string, Record<string, number>> }
interface State {
  hosts: Map<string, Map<string, number>>;
  loadedFrom?: string;
  /** A save is pending: written after a moment, or right away when the server shuts down. */
  saveTimer?: NodeJS.Timeout;
  saveOnShutdown?: () => void;
}

// Kept on globalThis so state survives hot reloads in dev
const g = globalThis as typeof globalThis & { __playedSongs__?: State };
const state: State = (g.__playedSongs__ ??= { hosts: new Map() });

const dataDir = () => process.env.DATA_DIR || undefined;

/** A host's key: a hash of their login, so the file holds no names or e-mail addresses. */
export function hostKey(userId: string): string {
  return createHash("sha256").update(userId).digest("base64url").slice(0, 22);
}

/** Reads the file once (again, if DATA_DIR changed – tests). A missing or broken file starts empty. */
function load() {
  const dir = dataDir();
  if (!dir || state.loadedFrom === dir) return;
  state.loadedFrom = dir;
  try {
    const data = JSON.parse(readFileSync(path.join(dir, FILE), "utf8")) as FileFormat;
    for (const [host, songs] of Object.entries(data.hosts ?? {})) {
      const known = state.hosts.get(host) ?? new Map<string, number>();
      for (const [trackId, at] of Object.entries(songs)) if (typeof at === "number" && at > (known.get(trackId) ?? 0)) known.set(trackId, at);
      state.hosts.set(host, known);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.warn("played-songs.json konnte nicht gelesen werden", e);
  }
}

/**
 * Checks at startup that DATA_DIR can be written – otherwise the server runs on, but forgets the played songs
 * on every restart, which nobody would notice. Returns the warning (also logged), or undefined if all is well.
 */
export function checkDataDir(): string | undefined {
  const dir = dataDir();
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return;
  } catch {
    const uid = process.getuid?.();
    const gid = process.getgid?.();
    const warning = `DATA_DIR ${dir} ist nicht beschreibbar, gespielte Songs gehen beim Neustart verloren.` +
      (uid === undefined ? "" : ` Der Server läuft als UID ${uid}; ein Bind-Mount muss ihr gehören: chown -R ${uid}:${gid} <Ordner auf dem Host>`);
    console.warn(warning);
    return warning;
  }
}

/** Writes everything now (also on shutdown); old entries are dropped. */
export function savePlayedSongs(now = Date.now()) {
  clearTimeout(state.saveTimer);
  state.saveOnShutdown?.();
  state.saveTimer = undefined;
  state.saveOnShutdown = undefined;
  const dir = dataDir();
  if (!dir) return;
  const hosts: FileFormat["hosts"] = {};
  for (const [host, songs] of state.hosts) {
    for (const [trackId, at] of songs) if (at < now - KEEP_MS) songs.delete(trackId);
    if (songs.size) hosts[host] = Object.fromEntries(songs);
  }
  try {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, FILE);
    // Written next to it and renamed: a crash while writing leaves the old file intact
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, hosts } satisfies FileFormat));
    renameSync(`${file}.tmp`, file);
  } catch (e) {
    console.warn("played-songs.json konnte nicht geschrieben werden", e);
  }
}

/** Notes that a host's game played these songs. */
export function markPlayed(host: string, trackIds: string[], now = Date.now()) {
  if (!trackIds.length) return;
  load();
  const songs = state.hosts.get(host) ?? new Map<string, number>();
  state.hosts.set(host, songs);
  for (const trackId of trackIds) {
    songs.delete(trackId); // newest last: Maps keep insertion order
    songs.set(trackId, now);
  }
  for (const trackId of songs.keys()) {
    if (songs.size <= MAX_PER_HOST) break;
    songs.delete(trackId);
  }
  if (dataDir() && !state.saveTimer) {
    state.saveTimer = setTimeout(() => savePlayedSongs(), SAVE_DELAY_MS);
    state.saveTimer.unref?.();
    state.saveOnShutdown = onShutdown(() => savePlayedSongs());
  }
}

/** When a host's games last played each song (recently enough to count). */
export function playedSongs(host: string, now = Date.now()): ReadonlyMap<string, number> {
  load();
  const songs = state.hosts.get(host);
  if (!songs) return new Map();
  return new Map([...songs].filter(([, at]) => at >= now - KEEP_MS));
}

/** Tests: forgets everything in memory (the file stays). */
export function resetPlayedSongs() {
  clearTimeout(state.saveTimer);
  state.saveOnShutdown?.();
  state.hosts.clear();
  state.loadedFrom = undefined;
  state.saveTimer = undefined;
  state.saveOnShutdown = undefined;
}
