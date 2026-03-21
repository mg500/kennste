import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createGame } from "@/lib/games";

export async function POST() {
  const session = await getServerSession(authOptions);
  const hostToken = (session as { accessToken?: string })?.accessToken;
  const game = createGame(hostToken);
  return NextResponse.json({ id: game.id });
}
