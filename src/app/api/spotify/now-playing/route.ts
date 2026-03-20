import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

interface TrackExtra {
  bpm: number | null;
  genres: string[] | null;
}

const trackCache = new Map<string, TrackExtra>();

async function fetchTrackExtra(trackId: string, artistId: string | undefined, headers: Record<string, string>): Promise<TrackExtra> {
  if (trackCache.has(trackId)) return trackCache.get(trackId)!;

  const [trackRes, artistRes] = await Promise.all([
    fetch(`https://api.spotify.com/v1/tracks/${trackId}`, { headers }),
    artistId ? fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers }) : Promise.resolve(null),
  ]);

  const track = trackRes.ok ? await trackRes.json() : null;
  const artist = artistRes?.ok ? await artistRes.json() : null;
  const isrc = track?.external_ids?.isrc;

  const spotifyGenres: string[] = Array.isArray(artist?.genres) ? artist.genres : [];

  let bpm: number | null = null;
  let genres: string[] | null = spotifyGenres.length > 0 ? spotifyGenres.slice(0, 4) : null;

  if (isrc) {
    const deezerRes = await fetch(`https://api.deezer.com/track/isrc:${isrc}`);
    const deezerRaw = deezerRes.ok ? await deezerRes.json() : null;
    const deezer = deezerRaw?.error ? null : deezerRaw;

    if (deezer?.bpm > 0) bpm = Math.round(deezer.bpm);

    const deezerAlbumId = deezer?.album?.id;
    if (deezerAlbumId) {
      const albumRes = await fetch(`https://api.deezer.com/album/${deezerAlbumId}`);
      const album = albumRes.ok ? await albumRes.json() : null;
      const deezerGenres: string[] = album?.genres?.data?.map((g: { name: string }) => g.name) ?? [];
      if (deezerGenres.length > 0) genres = deezerGenres.slice(0, 4);
    }
  }

  const result: TrackExtra = { bpm, genres };
  trackCache.set(trackId, result);
  if (trackCache.size > 50) trackCache.delete(trackCache.keys().next().value!);

  return result;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers = { Authorization: `Bearer ${session.accessToken}` };

  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode", { headers });

  if (res.status === 204 || res.status > 400) {
    return NextResponse.json({ isPlaying: false });
  }

  const data = await res.json();
  const isEpisode = data.currently_playing_type === "episode" || data.item?.type === "episode";

  if (isEpisode) {
    const item = data.item;
    return NextResponse.json({
      isPlaying: data.is_playing,
      type: "episode" as const,
      title: item?.name,
      description: item?.description,
      showName: item?.show?.name,
      publisher: item?.show?.publisher,
      albumArt: item?.show?.images?.[0]?.url,
      songUrl: item?.external_urls?.spotify,
      progressMs: data.progress_ms,
      durationMs: item?.duration_ms,
      explicit: item?.explicit ?? false,
      releaseYear: item?.release_date?.split("-")[0],
    });
  }

  const trackId = data.item?.id;
  const artistId = data.item?.artists?.[0]?.id;
  const extra = trackId ? await fetchTrackExtra(trackId, artistId, headers) : { bpm: null, genres: null };

  return NextResponse.json({
    isPlaying: data.is_playing,
    type: "track" as const,
    title: data.item?.name,
    artist: data.item?.artists?.map((a: { name: string }) => a.name).join(", "),
    album: data.item?.album?.name,
    albumArt: data.item?.album?.images?.[0]?.url,
    songUrl: data.item?.external_urls?.spotify,
    progressMs: data.progress_ms,
    durationMs: data.item?.duration_ms,
    popularity: data.item?.popularity,
    releaseYear: data.item?.album?.release_date?.split("-")[0],
    explicit: data.item?.explicit ?? false,
    albumType: data.item?.album?.album_type as "album" | "single" | "compilation" | undefined,
    genres: extra.genres,
    bpm: extra.bpm,
  });
}
