import { NextResponse } from "next/server";
import { pickSong } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { playerId, trackId, songName, artistName, albumArt, previewUrl, albumName, releaseYear } = await req.json();
  const game = pickSong(id, playerId, trackId ?? "", songName, artistName, albumArt ?? "", previewUrl ?? null, albumName, releaseYear);
  if (!game) return NextResponse.json({ error: "Cannot pick song" }, { status: 400 });
  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
