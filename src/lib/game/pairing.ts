import { randomInt, randomUUID } from "node:crypto";

/**
 * Connecting a TV without typing: the TV asks for a short code and shows it, the host enters it on their
 * phone (or scans the QR code), and the TV learns which game to show. In memory like the games.
 */
interface Pairing {
  /** Secret the TV polls with — the code alone must not reveal the game to whoever guesses it. */
  screenId: string;
  code: string;
  expiresAt: number;
  /** Set once the host paired it; the TV picks it up on its next poll. */
  gameId?: string;
}

export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Codes are 4 digits; this many open at once keeps guessing a valid one unlikely. */
const MAX_OPEN = 100;
/** Wrong codes per game and minute, against trying them all. */
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 60 * 1000;

interface PairingStore { byScreen: Map<string, Pairing>; failures: Map<string, number[]> }

// Kept on globalThis so state survives hot reloads in dev
const g = globalThis as typeof globalThis & { __pairings__?: PairingStore };
const pairings: PairingStore = (g.__pairings__ ??= { byScreen: new Map(), failures: new Map() });

function prune(now: number) {
  for (const [id, p] of pairings.byScreen) if (p.expiresAt <= now) pairings.byScreen.delete(id);
}

function openWithCode(code: string, now: number): Pairing | undefined {
  for (const p of pairings.byScreen.values()) if (p.code === code && !p.gameId && p.expiresAt > now) return p;
  return undefined;
}

/** A new code for a TV, or null when too many are open. */
export function createPairing(now = Date.now()): { screenId: string; code: string; expiresInMs: number } | null {
  prune(now);
  if ([...pairings.byScreen.values()].filter(p => !p.gameId).length >= MAX_OPEN) return null;
  let code: string;
  do code = String(randomInt(10_000)).padStart(4, "0");
  while (openWithCode(code, now));
  const pairing = { screenId: randomUUID(), code, expiresAt: now + PAIRING_TTL_MS };
  pairings.byScreen.set(pairing.screenId, pairing);
  return { screenId: pairing.screenId, code, expiresInMs: PAIRING_TTL_MS };
}

/** What the TV sees when it polls: still waiting (with its code), paired to a game, or gone (expired). */
export function pairingStatus(screenId: string, now = Date.now()):
  { status: "waiting"; code: string; expiresInMs: number } | { status: "paired"; gameId: string } | null {
  const p = pairings.byScreen.get(screenId);
  if (!p || p.expiresAt <= now) return null;
  if (p.gameId) {
    pairings.byScreen.delete(screenId);
    return { status: "paired", gameId: p.gameId };
  }
  return { status: "waiting", code: p.code, expiresInMs: p.expiresAt - now };
}

function tooManyFailures(gameId: string, now: number): boolean {
  const recent = (pairings.failures.get(gameId) ?? []).filter(t => now - t < FAILURE_WINDOW_MS);
  pairings.failures.set(gameId, recent);
  return recent.length >= MAX_FAILURES;
}

/** Whether a code is valid right now (shown before the host confirms after scanning). Counts as an attempt. */
export function checkCode(gameId: string, code: string, now = Date.now()): string | null {
  if (tooManyFailures(gameId, now)) return "Zu viele Versuche – kurz warten";
  if (openWithCode(code, now)) return null;
  pairings.failures.get(gameId)!.push(now);
  return "Kein Fernseher mit diesem Code – steht ein neuer auf dem TV?";
}

/** The host connects the TV showing `code` to their game. Returns an error message, or null. */
export function pairScreen(gameId: string, code: string, now = Date.now()): string | null {
  const error = checkCode(gameId, code, now);
  if (error) return error;
  const pairing = openWithCode(code, now)!;
  pairing.gameId = gameId;
  // Paired just before the code ran out: the TV still gets to pick it up
  pairing.expiresAt = Math.max(pairing.expiresAt, now + 60 * 1000);
  return null;
}

/** For tests. */
export function resetPairings() {
  pairings.byScreen.clear();
  pairings.failures.clear();
}
