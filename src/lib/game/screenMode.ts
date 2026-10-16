"use client";

const KEY = "kennste-paired-screen";

/** This browser is a TV connected via /tv: after a game it goes back there for the next code. */
export function markPairedScreen() {
  try { sessionStorage.setItem(KEY, "1"); } catch {}
}

export function isPairedScreen(): boolean {
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
}
