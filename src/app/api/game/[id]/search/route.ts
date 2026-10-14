import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getHostToken } from "@/lib/games";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Use game's stored host token, or fall back to current session (host is calling)
  const token = (await getHostToken(id)) ?? (await getServerSession(authOptions))?.accessToken;

  if (!token) return NextResponse.json({ tracks: [] });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return NextResponse.json({ tracks: [] });

  const data = await res.json();
  const tracks = (data.tracks?.items ?? []).map((t: {
    id: string; name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[]; release_date: string };
    preview_url: string | null;
  }) => ({
    id: t.id,
    name: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    releaseYear: t.album.release_date?.slice(0, 4) ?? undefined,
    albumArt: t.album.images[0]?.url ?? null,
    previewUrl: t.preview_url,
  }));

  return NextResponse.json({ tracks });
}
