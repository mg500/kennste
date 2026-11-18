"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Decor } from "@/components/ui/Decor";
import { QrCode } from "@/components/ui/QrCode";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useTvScale } from "@/components/ui/useTvScale";
import { markPairedScreen } from "@/lib/game/screenMode";
import { Logo } from "@/components/ui/Logo";

const POLL_MS = 2000;
const noSubscribe = () => () => {};

type Pairing = { screenId: string; code: string; expiresAt: number };

/**
 * A TV connects without typing a game code: it shows a short code (and a QR code), the host enters or scans
 * it on their phone, and the TV switches to that game. Opened once per evening, e.g. as a bookmark.
 */
export default function TvPage() {
  const router = useRouter();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairedGame, setPairedGame] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const scale = useTvScale();

  // A fresh code on start and whenever the last one ran out
  const expired = !pairing || now >= pairing.expiresAt;
  useEffect(() => {
    if (!expired || pairedGame) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/tv", { method: "POST" }).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        setPairing({ screenId: data.screenId, code: data.code, expiresAt: Date.now() + data.expiresInMs });
        setError(null);
      } else {
        setError(data?.error ?? "Keine Verbindung zum Server");
        setTimeout(() => setNow(Date.now() + 10_000), 10_000); // try again
      }
    })();
    return () => { cancelled = true; };
  }, [expired, pairedGame]);

  // Waits for the host; the countdown ticks along
  const screenId = pairing?.screenId;
  useEffect(() => {
    if (!screenId || pairedGame) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const res = await fetch(`/api/tv/${screenId}`).catch(() => null);
      if (res?.status === 404) { setPairing(null); return; }
      const data = await res?.json().catch(() => null);
      if (data?.status === "paired") setPairedGame(data.gameId);
    }, POLL_MS);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [screenId, pairedGame]);

  // Connected: a moment for "Verbunden!", then the game
  useEffect(() => {
    if (!pairedGame) return;
    markPairedScreen();
    const t = setTimeout(() => router.replace(`/game/${pairedGame}/screen`), 1500);
    return () => clearTimeout(t);
  }, [pairedGame, router]);

  const left = pairing ? Math.max(0, Math.floor((pairing.expiresAt - now) / 1000)) : 0;
  const countdown = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <main style={scale} className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-bg px-[72px] py-14 text-text">
      <Decor variant="wide" />
      <div className="relative flex items-center gap-4">
        <span className="flex-1"><Logo size="lg" /></span>
        <ThemeToggle compact />
      </div>

      <div className="relative grid flex-1 grid-cols-[minmax(0,1fr)_560px] items-center gap-18">
        {pairedGame ? (
          <div role="status" className="flex flex-col gap-5">
            <span className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-positive text-on-accent" aria-hidden>
              <Check size={52} strokeWidth={3} />
            </span>
            <h1 className="font-display text-[80px] leading-[0.95] font-extrabold tracking-tight">Verbunden!</h1>
            <p className="text-[26px] text-muted">Gleich geht&apos;s los …</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <h1 className="font-display text-[80px] leading-[0.95] font-extrabold tracking-tight">Fernseher<br />verbinden</h1>
            <ol className="flex flex-col gap-4.5 text-[26px]">
              {["Am Handy die Lobby öffnen", "„TV verbinden“ tippen", "Code eingeben – oder QR-Code scannen"].map((step, i) => (
                <li key={step} className="flex items-center gap-4.5">
                  <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface text-[22px] font-extrabold text-primary-text">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className={`flex flex-col items-center gap-7 rounded-[36px] bg-surface p-10 transition-opacity ${pairedGame ? "opacity-35" : ""}`}>
          {error ? <p className="text-center text-xl text-muted">{error}</p> : pairing && (
            <>
              <span className="text-xl text-muted">Code am Handy eingeben</span>
              <div role="img" aria-label={`Kopplungscode ${pairing.code.split("").join(" ")}`} className="flex gap-3.5">
                {pairing.code.split("").map((digit, i) => (
                  <span key={i} className="inline-flex h-31 w-25 items-center justify-center rounded-[22px] bg-bg font-display text-[80px] font-extrabold text-primary-text">{digit}</span>
                ))}
              </div>
              <div className="flex w-full items-center gap-5 text-lg text-muted">
                <span aria-hidden className="h-0.5 flex-1 bg-surface-2" />oder mit der Kamera scannen<span aria-hidden className="h-0.5 flex-1 bg-surface-2" />
              </div>
              {origin && <QrCode value={`${origin}/tv/pair/${pairing.code}`} size={168} />}
              <span className="text-[17px] text-muted">Neuer Code in {countdown}</span>
            </>
          )}
        </div>
      </div>

      <p className="relative self-end text-lg text-muted">
        Kein Host-Handy zur Hand? <Link href="/game" className="font-bold text-text underline-offset-4 hover:underline">Spielcode eingeben</Link> geht auch weiterhin.
      </p>
    </main>
  );
}
