import { NextResponse } from "next/server";
import { judge } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { action } = await req.json() as { action: "correct" | "wrong" | "skip" };
  const game = judge(id, action);
  if (!game) return NextResponse.json({ error: "Cannot judge" }, { status: 400 });
  const { hostToken: _, ...publicGame } = game;
  return NextResponse.json(publicGame);
}
