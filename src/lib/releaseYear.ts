// Original release year of a song via MusicBrainz (free, no API key).
// Spotify's album date is often a remaster or compilation (e.g. 2011 instead of 1975).
// API rules: max. 1 request/second per client, meaningful User-Agent.
// https://musicbrainz.org/doc/MusicBrainz_API

import type { Track } from "./game/types";
import { timing } from "./spotify";
import { APP_VERSION } from "./version";

const MB = process.env.MUSICBRAINZ_URL ?? "https://musicbrainz.org/ws/2";
const MIN_INTERVAL_MS = 1100;
/** MusicBrainz wants to know who asks: app, version and how to reach the operator. */
const USER_AGENT = `Kennste/${APP_VERSION} ( ${process.env.MUSICBRAINZ_CONTACT || process.env.NEXTAUTH_URL || "self-hosted"} )`;
/** A request that takes longer counts as MusicBrainz not answering – it must not hold up the queue. */
const REQUEST_TIMEOUT_MS = 4000;

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

interface MbJob { urgent: boolean; run: () => Promise<void> }
interface MbClient { queue: MbJob[]; busy: boolean; last: number; cache: Map<string, number | null>; failedAt?: number }
const g = globalThis as typeof globalThis & { __mb__?: MbClient };
const mb: MbClient = (g.__mb__ ??= { queue: [], busy: false, last: 0, cache: new Map() });

/** How long MusicBrainz counts as unavailable after a failed request. */
const DOWN_MS = 30_000;

/** MusicBrainz failed to answer a moment ago – waiting for it would only hold things up. */
export function musicBrainzDown(): boolean {
  return mb.failedAt !== undefined && Date.now() - mb.failedAt < DOWN_MS;
}

/** Works through the queue one request at a time, at most one per MIN_INTERVAL_MS. */
async function pump() {
  if (mb.busy) return;
  mb.busy = true;
  try {
    for (let job = mb.queue.shift(); job; job = mb.queue.shift()) {
      // At most one interval, even if the clock jumped back
      const wait = Math.min(MIN_INTERVAL_MS, mb.last + MIN_INTERVAL_MS - Date.now()) * timing.scale;
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      mb.last = Date.now();
      await job.run();
    }
  } finally {
    mb.busy = false;
  }
}

/**
 * GET from MusicBrainz, one request at a time. `urgent`: a round waits for it – it goes before the background
 * lookup's requests. Throws MusicBrainzUnavailable if it can't answer (offline, 503, too slow).
 */
function mbFetch<T>(path: string, urgent = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: MbJob = {
      urgent,
      run: async () => {
        let status = 0;
        let data: T | undefined;
        try {
          const res = await fetch(`${MB}${path}`, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          status = res.status;
          // 404: unknown ISRC – a real answer. Anything else (503 = too many requests) says nothing about the song.
          if (res.status === 404) data = {} as T;
          else if (res.ok) data = (await res.json()) as T;
        } catch {}
        if (data === undefined) {
          mb.failedAt = Date.now();
          reject(new MusicBrainzUnavailable(status ? `HTTP ${status}` : "offline, too slow or invalid answer"));
          return;
        }
        mb.failedAt = undefined;
        resolve(data);
      },
    };
    const firstNormal = mb.queue.findIndex(j => !j.urgent);
    if (urgent && firstNormal >= 0) mb.queue.splice(firstNormal, 0, job);
    else mb.queue.push(job);
    void pump();
  });
}

const escapeQuery = (s: string) => s.replace(/["\\]/g, "");

/**
 * Looks up the original release year. Returns undefined if MusicBrainz knows nothing better; throws
 * MusicBrainzUnavailable if it couldn't be asked (then nothing is cached).
 */
export async function lookupOriginalYear(track: Pick<Track, "name" | "artist" | "isrc">, urgent = false): Promise<number | undefined> {
  const key = track.isrc ?? `${normalizeTitle(track.name)}|${track.artist.toLowerCase()}`;
  if (mb.cache.has(key)) return mb.cache.get(key) ?? undefined;

  let year: number | undefined;
  if (track.isrc) {
    const data = await mbFetch<{ recordings?: MbRecording[] }>(`/isrc/${encodeURIComponent(track.isrc)}?fmt=json`, urgent);
    year = earliestFromIsrc(data.recordings ?? []);
  }
  if (year === undefined) {
    const artist = track.artist.split(",")[0].trim();
    const query = `recording:"${escapeQuery(normalizeTitle(track.name))}" AND artist:"${escapeQuery(artist)}"`;
    const data = await mbFetch<{ recordings?: MbRecording[] }>(`/recording?fmt=json&limit=50&query=${encodeURIComponent(query)}`, urgent);
    year = earliestFromSearch(data.recordings ?? [], track.name, artist);
  }
  mb.cache.set(key, year ?? null);
  return year;
}

/**
 * Returns the track with its year corrected to the original release (never later than Spotify's). If MusicBrainz
 * can't be asked, the track comes back unchanged and not marked as verified, so it can be tried again later.
 */
export async function withOriginalYear(track: Track, opts: { urgent?: boolean } = {}): Promise<Track> {
  if (track.yearVerified) return track;
  let original: number | undefined;
  try {
    original = await lookupOriginalYear(track, opts.urgent);
  } catch (e) {
    if (e instanceof MusicBrainzUnavailable) return track;
    throw e;
  }
  const spotify = yearOf(track.releaseYear);
  const best = [original, spotify].filter((y): y is number => y !== undefined);
  return { ...track, releaseYear: best.length ? String(Math.min(...best)) : track.releaseYear, yearVerified: true };
}
