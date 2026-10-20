// Browsing songs by decade and genre through Spotify's search filters (instead of playlists, which the app
// can only read when they belong to the host – see "Notes on the Spotify API" in docs/development.md).

export const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;

/** Genre labels and the Spotify genre they search for (an artist's genre, matched by `genre:`). */
export const GENRES = [
  { id: "pop", label: "Pop" },
  { id: "rock", label: "Rock" },
  { id: "dance", label: "Party" },
  { id: "german pop", label: "Deutsch" },
  { id: "schlager", label: "Schlager" },
  { id: "hip hop", label: "Hip-Hop" },
  { id: "soundtrack", label: "Filmmusik" },
] as const;

export interface BrowseFilter {
  decade?: number;
  genre?: string;
}

export const decadeLabel = (d: number) => (d === 2000 ? "2000er" : d === 2010 ? "2010er" : d === 2020 ? "2020er" : `${String(d).slice(2)}er`);

/** The Spotify search query for a filter, or null if it filters nothing. */
export function browseQuery({ decade, genre }: BrowseFilter): string | null {
  const parts: string[] = [];
  if (decade !== undefined && (DECADES as readonly number[]).includes(decade)) parts.push(`year:${decade}-${decade + 9}`);
  if (genre && GENRES.some(g => g.id === genre)) parts.push(`genre:"${genre}"`);
  return parts.length ? parts.join(" ") : null;
}

/** Reads a filter from URL search params (`decade`, `genre`). */
export function parseBrowseFilter(params: URLSearchParams): BrowseFilter {
  const decade = Number(params.get("decade"));
  const genre = params.get("genre") ?? undefined;
  return { ...(Number.isInteger(decade) && decade > 0 ? { decade } : {}), ...(genre ? { genre } : {}) };
}

export const browseParams = (f: BrowseFilter) =>
  [f.decade !== undefined ? `decade=${f.decade}` : "", f.genre ? `genre=${encodeURIComponent(f.genre)}` : ""].filter(Boolean).join("&");
