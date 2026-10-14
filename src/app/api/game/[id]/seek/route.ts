import { NextResponse } from "next/server";
import { getHostToken } from "@/lib/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  const { positionMs } = await req.json();
  if (typeof positionMs !== "number") return NextResponse.json({ error: "Invalid position" }, { status: 400 });

  const res = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${Math.round(positionMs)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 204) return NextResponse.json({ error: "Seek fehlgeschlagen" }, { status: res.status });
  return NextResponse.json({ ok: true });
}
