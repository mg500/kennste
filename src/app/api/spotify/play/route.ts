import { NextResponse } from "next/server";
import { sessionAccessToken } from "@/lib/auth";
import { runEffect, transferPlayback } from "@/lib/spotify";

/** Plays a track on the device, or (without `trackId`) moves the current playback there. */
export async function POST(req: Request) {
  const token = await sessionAccessToken();
  if (!token) return NextResponse.json({ error: "Nicht mit Spotify angemeldet" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.deviceId !== "string") return NextResponse.json({ error: "Ungültiges Gerät" }, { status: 400 });
  if (body.trackId !== undefined && typeof body.trackId !== "string") return NextResponse.json({ error: "Ungültiger Song" }, { status: 400 });

  const error = body.trackId
    ? await runEffect(token, { type: "play", trackId: body.trackId }, body.deviceId)
    : await transferPlayback(token, body.deviceId);
  return error ? NextResponse.json({ error }, { status: 502 }) : NextResponse.json({ ok: true });
}
