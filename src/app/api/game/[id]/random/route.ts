import { NextResponse } from "next/server";
import { getGame } from "@/lib/games";

const CHARS = "abcdefghijklmnopqrstuvwxyz";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const game = getGame(id);
  if (!game?.hostToken) return NextResponse.json({ track: null });

  const letter = CHARS[Math.floor(Math.random() * CHARS.length)];
  const offset = Math.floor(Math.random() * 50);

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${letter}&type=track&limit=1&offset=${offset}`,
    { headers: { Authorization: `Bearer ${game.hostToken}` } },
  );
  if (!res.ok) return NextResponse.json({ track: null });

  const data = await res.json();
  const t = data.tracks?.items?.[0];
  if (!t) return NextResponse.json({ track: null });

  return NextResponse.json({
    track: {
      id: t.id,
      name: t.name,
      artist: t.artists.map((a: { name: string }) => a.name).join(", "),
      albumArt: t.album.images[0]?.url ?? null,
      previewUrl: t.preview_url,
    },
  });
}
