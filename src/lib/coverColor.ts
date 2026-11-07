import { decode } from "jpeg-js";
import { accentOf } from "./accentColor";

/**
 * The color of the stage light in "Bühne" for a song: its cover's main color (see accentOf), worked out on the
 * server so every device gets it while the song itself stays hidden. Null for grey or dark covers, and when the
 * cover can't be read – the stage keeps its normal light then.
 */

/** Spotify's image servers. Players send the cover URL of a song they picked, so nothing else is fetched. */
const COVER_HOSTS = /(^|\.)(scdn\.co|spotifycdn\.com)$/;
const FETCH_TIMEOUT_MS = 4000;
const MAX_BYTES = 2_000_000;
/** About 2500 pixels are plenty for the main color. */
const SAMPLES = 2500;
const CACHE_SIZE = 500;

const cache = new Map<string, Promise<string | null>>();

export function isCoverUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && COVER_HOSTS.test(hostname);
  } catch {
    return false;
  }
}

async function readColor(url: string): Promise<string | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(() => null);
  if (!res?.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (!bytes.length || bytes.length > MAX_BYTES) return null;
  try {
    const { data, width, height } = decode(bytes, { useTArray: true, maxResolutionInMP: 4, maxMemoryUsageInMB: 64 });
    return accentOf(data, Math.max(1, Math.floor((width * height) / SAMPLES)));
  } catch {
    return null;
  }
}

/** The stage light's color for a cover; each cover is read once (failures too, until the cache moves on). */
export function coverColor(url: string | null | undefined): Promise<string | null> {
  if (!url || !isCoverUrl(url)) return Promise.resolve(null);
  let color = cache.get(url);
  if (!color) {
    color = readColor(url);
    cache.set(url, color);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return color;
}

/** For tests: forget what was read. */
export function clearCoverColors() {
  cache.clear();
}
