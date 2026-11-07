import { describe, expect, it } from "vitest";
import { diagnoseReport } from "./diagnoseReport";

describe("diagnoseReport", () => {
  it("lists every step with its result, after when, which build and which device", () => {
    const text = diagnoseReport([
      { name: "Spotify-Konto", ok: true, detail: "Angemeldet als Max" },
      { name: "Fremde Playlist", ok: null, detail: "Keine passende Playlist gefunden" },
      { name: "Pausieren und fortsetzen", ok: false, detail: "Pause ✗" },
    ], { version: "v1.0.0 · edge 2981c05", device: "MacBook Air (Computer)", date: new Date(2026, 10, 7, 21, 30) });
    expect(text.split("\n")).toEqual([
      "Kennste?! – Spotify-Diagnose",
      "07.11.2026, 21:30 · v1.0.0 · edge 2981c05 · Gerät: MacBook Air (Computer)",
      "1 von 3 Prüfungen fehlgeschlagen",
      "",
      "✓ Spotify-Konto: Angemeldet als Max",
      "– Fremde Playlist: Keine passende Playlist gefunden",
      "✗ Pausieren und fortsetzen: Pause ✗",
    ]);
  });
});
