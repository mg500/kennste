import { NextResponse } from "next/server";
import { getGame, resolvePlayer } from "./store";
import { PLAYER_TOKEN_HEADER } from "./types";

/** Authenticates the calling player via their token header. Returns the player ID or an error response. */
export function requirePlayer(req: Request, gameId: string, opts: { host?: boolean } = {}): string | NextResponse {
  const game = getGame(gameId);
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });
  const playerId = resolvePlayer(gameId, req.headers.get(PLAYER_TOKEN_HEADER));
  if (!playerId) return NextResponse.json({ error: "Nicht im Spiel" }, { status: 401 });
  if (opts.host && game.hostPlayerId !== playerId) return NextResponse.json({ error: "Nur für den Host" }, { status: 403 });
  return playerId;
}
