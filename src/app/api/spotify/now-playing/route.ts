import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

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

  const [trackRes, artistRes] = await Promise.all([
    trackId ? fetch(`https://api.spotify.com/v1/tracks/${trackId}`, { headers }) : Promise.resolve(null),
    artistId ? fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers }) : Promise.resolve(null),
  ]);

  const track = trackRes?.ok ? await trackRes.json() : null;
  const artist = artistRes?.ok ? await artistRes.json() : null;
  const isrc = track?.external_ids?.isrc;

  const deezerRes = isrc ? await fetch(`https://api.deezer.com/track/isrc:${isrc}`) : null;
  const deezerRaw = deezerRes?.ok ? await deezerRes.json() : null;
  const deezer = deezerRaw?.error ? null : deezerRaw;

  const deezerAlbumId = deezer?.album?.id;
  const deezerAlbumRes = deezerAlbumId ? await fetch(`https://api.deezer.com/album/${deezerAlbumId}`) : null;
  const deezerAlbum = deezerAlbumRes?.ok ? await deezerAlbumRes.json() : null;

  const deezerGenres = deezerAlbum?.genres?.data?.map((g: { name: string }) => g.name) ?? [];
  const spotifyGenres = Array.isArray(artist?.genres) ? artist.genres : [];
  const genres = deezerGenres.length > 0 ? deezerGenres.slice(0, 4) : spotifyGenres.slice(0, 4);

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
    genres: genres.length > 0 ? genres : null,
    bpm: deezer?.bpm > 0 ? Math.round(deezer.bpm) : null,
  });
}
