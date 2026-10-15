import { NextResponse } from "next/server";
import { sessionAccessToken } from "@/lib/auth";
import { runDiagnosis } from "@/lib/diagnose";

/** Runs the Spotify checks (see /diagnose) with the signed-in user's account. Plays music on their device. */
export async function POST() {
  const token = await sessionAccessToken();
  if (!token) return NextResponse.json({ error: "Nicht mit Spotify angemeldet" }, { status: 401 });
  return NextResponse.json({ steps: await runDiagnosis(token) });
}
