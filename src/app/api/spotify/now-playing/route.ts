import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers = { Authorization: `Bearer ${session.accessToken}` };

  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers });

  if (res.status === 204 || res.status > 400) {
    return NextResponse.json({ isPlaying: false });
  }

  const data = await res.json();

  const artistId = data.item?.artists?.[0]?.id;
  const artistRes = artistId
    ? await fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers })
    : null;
  const artist = artistRes?.ok ? await artistRes.json() : null;

  return NextResponse.json({
    isPlaying: data.is_playing,
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
    trackNumber: data.item?.track_number,
    totalTracks: data.item?.album?.total_tracks,
    albumType: data.item?.album?.album_type as "album" | "single" | "compilation" | undefined,
    genres: Array.isArray(artist?.genres) && artist.genres.length > 0 ? artist.genres.slice(0, 4) : null,
  });
}
