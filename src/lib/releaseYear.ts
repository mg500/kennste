// Original release year of a song via MusicBrainz (free, no API key).
// Spotify's album date is often a remaster or compilation (e.g. 2011 instead of 1975).
// API rules: max. 1 request/second per client, meaningful User-Agent.
// https://musicbrainz.org/doc/MusicBrainz_API

import type { Track } from "./game/types";
import { timing } from "./spotify";

const MB = process.env.MUSICBRAINZ_URL ?? "https://musicbrainz.org/ws/2";
const MIN_INTERVAL_MS = 1100;
const USER_AGENT = `SpotifyToolbox/1.0 ( ${process.env.MUSICBRAINZ_CONTACT ?? process.env.NEXTAUTH_URL ?? "self-hosted"} )`;

interface MbRecording {
  title?: string;
  score?: number;
  "first-release-date"?: string;
  "artist-credit"?: { name?: string; artist?: { name?: string } }[];
}

/** MusicBrainz could not be asked (offline, rate limit with 503): nothing is known, try again later. */
export class MusicBrainzUnavailable extends Error {}

/** "Don't Stop Me Now - Remastered 2011" → "don't stop me now" */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/\s+-\s+.*$/, "")          // " - Remastered 2011", " - Single Version"
    .replace(/\s*[([].*?[)\]]/g, "")    // "(Remastered)", "[Live]"
    .replace(/\s+/g, " ")
    .trim();
}

const yearOf = (date?: string) => {
  const y = Number(date?.slice(0, 4));
  return Number.isInteger(y) && y > 1800 ? y : undefined;
};

/** Earliest year among the recordings of an ISRC lookup. */
export function earliestFromIsrc(recordings: MbRecording[]): number | undefined {
  const years = recordings.map(r => yearOf(r["first-release-date"])).filter((y): y is number => y !== undefined);
  return years.length ? Math.min(...years) : undefined;
}

const normalizeName = (name: string) => name.toLowerCase().replace(/^the /, "").replace(/[^\p{L}\p{N}]+/gu, "");

/** True if one of the recording's credited artists is `artist` (a search for "Hello" by Adele also finds other "Hello"s). */
function creditedTo(r: MbRecording, artist: string): boolean {
  const wanted = normalizeName(artist);
  return !!wanted && (r["artist-credit"] ?? []).some(c => [c.name, c.artist?.name].some(n => n && normalizeName(n) === wanted));
}

/** Earliest year among confident search hits by the artist whose title matches (ignores remaster/live suffixes). */
export function earliestFromSearch(recordings: MbRecording[], title: string, artist: string): number | undefined {
  const wanted = normalizeTitle(title);
  const years = recordings
    .filter(r => (r.score ?? 0) >= 90 && r.title && normalizeTitle(r.title) === wanted && creditedTo(r, artist))
    .map(r => yearOf(r["first-release-date"]))
    .filter((y): y is number => y !== undefined);
  return years.length ? Math.min(...years) : undefined;
}

// ── Rate-limited client (one queue for the whole server) ─────────────────────

interface MbClient { chain: Promise<unknown>; last: number; cache: Map<string, number | null>; failedAt?: number }
const g = globalThis as typeof globalThis & { __mb__?: MbClient };
const mb: MbClient = (g.__mb__ ??= { chain: Promise.resolve(), last: 0, cache: new Map() });

/** How long MusicBrainz counts as unavailable after a failed request. */
const DOWN_MS = 30_000;

/** MusicBrainz failed to answer a moment ago – waiting for it would only hold things up. */
export function musicBrainzDown(): boolean {
  return mb.failedAt !== undefined && Date.now() - mb.failedAt < DOWN_MS;
}

/** GET from MusicBrainz, one request at a time. Throws MusicBrainzUnavailable if it can't answer (offline, 503). */
function mbFetch<T>(path: string): Promise<T> {
  const run = async () => {
    // At most one interval, even if the clock jumped back
    const wait = Math.min(MIN_INTERVAL_MS, mb.last + MIN_INTERVAL_MS - Date.now()) * timing.scale;
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    mb.last = Date.now();
    let status = 0;
    let data: T | undefined;
    try {
      const res = await fetch(`${MB}${path}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      status = res.status;
      // 404: unknown ISRC – a real answer. Anything else (503 = too many requests) says nothing about the song.
      if (res.status === 404) data = {} as T;
      else if (res.ok) data = (await res.json()) as T;
    } catch {}
    if (data === undefined) {
      mb.failedAt = Date.now();
      throw new MusicBrainzUnavailable(status ? `HTTP ${status}` : "offline or invalid answer");
    }
    mb.failedAt = undefined;
    return data;
  };
  const result = mb.chain.then(run, run);
  mb.chain = result.catch(() => {});
  return result;
}

const escapeQuery = (s: string) => s.replace(/["\\]/g, "");

/**
 * Looks up the original release year. Returns undefined if MusicBrainz knows nothing better; throws
 * MusicBrainzUnavailable if it couldn't be asked (then nothing is cached).
 */
export async function lookupOriginalYear(track: Pick<Track, "name" | "artist" | "isrc">): Promise<number | undefined> {
  const key = track.isrc ?? `${normalizeTitle(track.name)}|${track.artist.toLowerCase()}`;
  if (mb.cache.has(key)) return mb.cache.get(key) ?? undefined;

  let year: number | undefined;
  if (track.isrc) {
    const data = await mbFetch<{ recordings?: MbRecording[] }>(`/isrc/${encodeURIComponent(track.isrc)}?fmt=json`);
    year = earliestFromIsrc(data.recordings ?? []);
  }
  if (year === undefined) {
    const artist = track.artist.split(",")[0].trim();
    const query = `recording:"${escapeQuery(normalizeTitle(track.name))}" AND artist:"${escapeQuery(artist)}"`;
    const data = await mbFetch<{ recordings?: MbRecording[] }>(`/recording?fmt=json&limit=50&query=${encodeURIComponent(query)}`);
    year = earliestFromSearch(data.recordings ?? [], track.name, artist);
  }
  mb.cache.set(key, year ?? null);
  return year;
}

/**
 * Returns the track with its year corrected to the original release (never later than Spotify's). If MusicBrainz
 * can't be asked, the track comes back unchanged and not marked as verified, so it can be tried again later.
 */
export async function withOriginalYear(track: Track): Promise<Track> {
  if (track.yearVerified) return track;
  let original: number | undefined;
  try {
    original = await lookupOriginalYear(track);
  } catch (e) {
    if (e instanceof MusicBrainzUnavailable) return track;
    throw e;
  }
  const spotify = yearOf(track.releaseYear);
  const best = [original, spotify].filter((y): y is number => y !== undefined);
  return { ...track, releaseYear: best.length ? String(Math.min(...best)) : track.releaseYear, yearVerified: true };
}
