import { NextResponse } from "next/server";
import { createGame } from "@/lib/games";

export async function POST() {
  const game = createGame();
  return NextResponse.json({ id: game.id });
}
