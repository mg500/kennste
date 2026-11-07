// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DiagnosePage from "./page";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/spotify/player"
    ? Response.json({ devices: [{ id: "mac", name: "MacBook Air", type: "Computer", isActive: true, isRestricted: false }] })
    : Response.json({ steps: [{ name: "Spotify-Konto", ok: true, detail: "Angemeldet als Max" }, { name: "Pausieren und fortsetzen", ok: false, detail: "Pause ✗" }] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function runCheck() {
  render(<DiagnosePage />);
  await screen.findByText("MacBook Air");
  fireEvent.click(screen.getByRole("button", { name: "Prüfung starten" }));
  await screen.findByText("1 von 2 Prüfungen fehlgeschlagen");
}

describe("Diagnose", () => {
  it("copies the result as text to paste into a chat", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await runCheck();
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis kopieren" }));
    await screen.findByText("Kopiert");
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain("Gerät: MacBook Air (Computer)");
    expect(text).toContain("✗ Pausieren und fortsetzen: Pause ✗");
  });

  it("without a clipboard (plain http), shows the text to copy by hand", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    await runCheck();
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis kopieren" }));
    expect((await screen.findByLabelText<HTMLTextAreaElement>("Ergebnis als Text")).value).toContain("✓ Spotify-Konto: Angemeldet als Max");
  });
});
