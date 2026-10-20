"use client";

import { useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { GameControls } from "@/lib/game/useGameSession";

const noSubscribe = () => () => {};

/** Host: connects a TV by the code it shows on /tv (or the TV's QR code is scanned instead). */
export function TvPairSheet({ controls, open, onClose }: { controls: GameControls; open: boolean; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const host = useSyncExternalStore(noSubscribe, () => window.location.host, () => "");

  const close = () => { setCode(""); setError(null); setDone(false); onClose(); };
  const submit = async () => {
    setBusy(true);
    const message = await controls.api.pairScreen(code);
    setBusy(false);
    if (message) setError(message);
    else setDone(true);
  };

  return (
    <Sheet open={open} onClose={close} title="TV verbinden">
      {done ? (
        <>
          <div role="status" className="flex items-center gap-3.5 rounded-2xl bg-bg p-4">
            <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-positive text-on-accent">
              <Check size={24} strokeWidth={3} />
            </span>
            <span className="flex flex-col">
              <strong>Fernseher verbunden</strong>
              <span className="text-sm text-muted">Er zeigt jetzt dein Spiel</span>
            </span>
          </div>
          <Button size="lg" block onClick={close}>Fertig</Button>
        </>
      ) : (
        <form onSubmit={e => { e.preventDefault(); if (code.length === 4) void submit(); }} className="flex flex-col gap-4">
          <p className="text-muted">Öffne am Fernseher <strong className="text-text">{host}/tv</strong> und gib den Code ein, der dort steht.</p>
          <label htmlFor="tv-code" className="font-bold">Code vom Fernseher</label>
          <input id="tv-code" value={code} inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="one-time-code" autoFocus
            onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(null); }}
            aria-invalid={!!error} aria-describedby={error ? "tv-code-error" : "tv-code-hint"} placeholder="····"
            className="h-18 w-full rounded-2xl border-2 border-surface-2 bg-bg text-center font-display text-4xl font-extrabold tracking-[0.5em] text-primary-text placeholder:text-muted focus:border-primary focus:outline-none aria-[invalid=true]:border-buzz" />
          {error
            ? <p id="tv-code-error" className="text-sm font-bold text-buzz-text">{error}</p>
            : <p id="tv-code-hint" className="text-sm text-muted">Oder den QR-Code am Fernseher mit der Handy-Kamera scannen.</p>}
          <Button type="submit" size="lg" block disabled={code.length < 4 || busy}>Verbinden</Button>
        </form>
      )}
    </Sheet>
  );
}
