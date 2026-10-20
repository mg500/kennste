import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { gameView, getHostToken, setDevice } from "@/lib/game/store";
import { fetchDevices, transferPlayback } from "@/lib/spotify";

/** The host's Spotify Connect devices. */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/devices">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;

  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "Host ist nicht mit Spotify verbunden" }, { status: 401 });
  const devices = await fetchDevices(token);
  if (!devices) return NextResponse.json({ error: "Geräte konnten nicht geladen werden" }, { status: 502 });
  return NextResponse.json({ devices });
}

/** Picks the playback device (`deviceId: null` → the host's active device) and moves playback there. */
export async function POST(req: Request, ctx: RouteContext<"/api/game/[id]/devices">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;

  const body = await req.json().catch(() => null);
  if (body?.deviceId === null) return NextResponse.json(setDevice(id, undefined) && gameView(id, host));
  if (typeof body?.deviceId !== "string") return NextResponse.json({ error: "Ungültiges Gerät" }, { status: 400 });

  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ error: "Host ist nicht mit Spotify verbunden" }, { status: 401 });
  const device = (await fetchDevices(token))?.find(d => d.id === body.deviceId);
  if (!device) return NextResponse.json({ error: "Gerät nicht gefunden – bitte aktualisieren" }, { status: 404 });
  if (device.isRestricted) return NextResponse.json({ error: "Dieses Gerät lässt sich nicht steuern" }, { status: 400 });

  const error = await transferPlayback(token, device.id);
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json(setDevice(id, { id: device.id, name: device.name, type: device.type }) && gameView(id, host));
}
