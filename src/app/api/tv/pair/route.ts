import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getMode } from "@/lib/game/modes";
import { checkCode, pairScreen } from "@/lib/game/pairing";
import { getGame, getHostSession } from "@/lib/game/store";

/** After scanning the TV's QR code: the host is recognized by their Spotify login, not a player token. */
async function hostGame() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? null;
  const hs = userId ? getHostSession(userId) : undefined;
  return hs ? getGame(hs.gameId) : undefined;
}

const validCode = (code: unknown): code is string => typeof code === "string" && /^\d{4}$/.test(code);
const noGame = () => NextResponse.json({ error: "Kein Spiel" }, { status: 404 });

/** Which game the TV would show, before the host confirms. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  const game = await hostGame();
  if (!game) return noGame();
  if (!validCode(code)) return NextResponse.json({ error: "Ungültiger Code" }, { status: 400 });
  const error = checkCode(game.id, code);
  if (error) return NextResponse.json({ error }, { status: 409 });
  const players = game.players.length + (game.viewerPlayers?.length ?? 0);
  return NextResponse.json({ gameId: game.id, mode: getMode(game.mode.id).name, players });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const game = await hostGame();
  if (!game) return noGame();
  if (!validCode(body?.code)) return NextResponse.json({ error: "Ungültiger Code" }, { status: 400 });
  const error = pairScreen(game.id, body.code);
  return error ? NextResponse.json({ error }, { status: 409 }) : NextResponse.json({ gameId: game.id });
}
