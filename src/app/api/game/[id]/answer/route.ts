import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { currentTrack, versusData } from "@/lib/game/modes/versus";
import { getGame, getPlaylist } from "@/lib/game/store";

/**
 * "Alle gegen alle": the song, but only for the player who buzzed and only once they have answered (they judge
 * their own answer). It is not part of the game state, which every client receives.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/answer">) {
  const { id } = await ctx.params;
  const player = requirePlayer(req, id);
  if (typeof player !== "string") return player;

  const game = getGame(id);
  if (game?.mode.id !== "versus") return NextResponse.json({ error: "Nicht in diesem Spiel" }, { status: 400 });
  const round = versusData(game).round;
  if (round?.buzzedBy !== player) return NextResponse.json({ error: "Du hast nicht gebuzzert" }, { status: 403 });
  if (round.state !== "judging") return NextResponse.json({ error: "Erst antworten, dann gibt es die Lösung" }, { status: 403 });
  const track = currentTrack(game, getPlaylist(id));
  if (!track) return NextResponse.json({ error: "Song nicht gefunden" }, { status: 404 });
  return NextResponse.json({ song: { name: track.name, artist: track.artist, releaseYear: track.releaseYear, albumArt: track.albumArt } });
}
