import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

const genreCache = new Map<string, string[] | null>();

async function fetchGenres(trackId: string, artistId: string | undefined, headers: Record<string, string>): Promise<string[] | null> {
  if (genreCache.has(trackId)) return genreCache.get(trackId)!;

  const artistRes = artistId ? await fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers }) : null;
  const artist = artistRes?.ok ? await artistRes.json() : null;
  const genres: string[] | null = Array.isArray(artist?.genres) && artist.genres.length > 0
    ? artist.genres.slice(0, 4)
    : null;

  genreCache.set(trackId, genres);
  if (genreCache.size > 50) genreCache.delete(genreCache.keys().next().value!);
  return genres;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers = { Authorization: `Bearer ${session.accessToken}` };

  // /me/player (unlike /currently-playing) also names the device
  const res = await fetch("https://api.spotify.com/v1/me/player?additional_types=episode", { headers });

  if (res.status === 204 || res.status > 400) {
    return NextResponse.json({ isPlaying: false });
  }

  const data = await res.json();
  if (!data.item) return NextResponse.json({ isPlaying: false });
  const device = data.device?.name as string | undefined;
  const isEpisode = data.currently_playing_type === "episode" || data.item?.type === "episode";

  if (isEpisode) {
    const item = data.item;
    return NextResponse.json({
      isPlaying: data.is_playing,
      device,
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
  const genres = trackId ? await fetchGenres(trackId, artistId, headers) : null;

  return NextResponse.json({
    isPlaying: data.is_playing,
    device,
    type: "track" as const,
    title: data.item?.name,
    artist: data.item?.artists?.map((a: { name: string }) => a.name).join(", "),
    album: data.item?.album?.name,
    albumArt: data.item?.album?.images?.[0]?.url,
    songUrl: data.item?.external_urls?.spotify,
    progressMs: data.progress_ms,
    durationMs: data.item?.duration_ms,
    releaseYear: data.item?.album?.release_date?.split("-")[0],
    explicit: data.item?.explicit ?? false,
    albumType: data.item?.album?.album_type as "album" | "single" | "compilation" | undefined,
    genres,
  });
}
