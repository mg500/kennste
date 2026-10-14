import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getGame, deleteGame, clearHostSession } from "@/lib/games";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const game = getGame(id);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(game);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? null;
  deleteGame(id);
  if (userId) clearHostSession(userId);
  return NextResponse.json({ ok: true });
}
