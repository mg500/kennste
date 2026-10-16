import { NextResponse } from "next/server";
import { createPairing } from "@/lib/game/pairing";

/** A TV asks for a code to show (see pairing.ts). */
export function POST() {
  const pairing = createPairing();
  return pairing
    ? NextResponse.json(pairing)
    : NextResponse.json({ error: "Gerade warten zu viele Fernseher – gleich nochmal" }, { status: 503 });
}
