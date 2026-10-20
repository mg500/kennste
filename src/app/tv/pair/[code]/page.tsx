"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/game/shared";
import { Logo } from "@/components/ui/Logo";

type Preview = { gameId: string; mode: string; players: number };
type State =
  | { step: "loading" }
  | { step: "confirm"; game: Preview }
  | { step: "noGame" }
  | { step: "error"; message: string }
  | { step: "done"; gameId: string };

/**
 * Opened by scanning the QR code on the TV (/tv). The host is recognized by their Spotify login and confirms
 * which of their games the TV should show.
 */
export default function PairScreenPage() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<State>({ step: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/tv/pair?code=${encodeURIComponent(code)}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (cancelled) return;
      if (res?.ok) setState({ step: "confirm", game: data });
      else if (res?.status === 404) setState({ step: "noGame" });
      else setState({ step: "error", message: data?.error ?? "Verbindung fehlgeschlagen" });
    })();
    return () => { cancelled = true; };
  }, [code]);

  const confirm = async () => {
    setBusy(true);
    const res = await fetch("/api/tv/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    setState(res?.ok ? { step: "done", gameId: data.gameId } : { step: "error", message: data?.error ?? "Verbindung fehlgeschlagen" });
  };

  const gameLink = (gameId: string, label: string) => (
    <Link href={`/game/${gameId}`} className="inline-flex h-15 items-center justify-center rounded-card bg-primary text-lg font-bold text-on-accent">{label}</Link>
  );

  return (
    <Screen decor="corner" header={<Logo />}>
      <div className="flex flex-1 flex-col justify-center gap-5">
        <span aria-hidden className="inline-flex h-22 w-22 items-center justify-center rounded-[26px] bg-surface text-primary-text">
          {state.step === "done" ? <Check size={44} strokeWidth={3} /> : <MonitorPlay size={44} />}
        </span>
        {state.step === "loading" && <p className="text-muted">Einen Moment …</p>}
        {state.step === "confirm" && (
          <>
            <h1 className="font-display text-[34px] leading-tight font-extrabold">Diesen Fernseher verbinden?</h1>
            <p className="text-lg text-muted">Er zeigt dann dein Spiel – Lobby, Runden und Punktestand für alle.</p>
            <div className="flex flex-col rounded-card bg-surface p-4">
              <span className="text-lg font-bold">{state.game.mode}</span>
              <span className="text-sm text-muted">
                Spiel <span className="uppercase">{state.game.gameId}</span> · {state.game.players} Spieler
              </span>
            </div>
          </>
        )}
        {state.step === "noGame" && (
          <>
            <h1 className="font-display text-[34px] leading-tight font-extrabold">Erst ein Spiel starten</h1>
            <p className="text-lg text-muted">Den Fernseher verbindet, wer ein Spiel leitet. Melde dich mit Spotify an und erstelle ein Spiel – danach den QR-Code einfach nochmal scannen.</p>
          </>
        )}
        {state.step === "error" && (
          <>
            <h1 className="font-display text-[34px] leading-tight font-extrabold">Das hat nicht geklappt</h1>
            <p className="text-lg text-muted">{state.message}</p>
          </>
        )}
        {state.step === "done" && (
          <h1 role="status" className="font-display text-[34px] leading-tight font-extrabold">Fernseher verbunden</h1>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {state.step === "confirm" && (
          <>
            <Button size="lg" block disabled={busy} onClick={confirm}>TV verbinden</Button>
            <Link href={`/game/${state.game.gameId}`} className="inline-flex h-13 items-center justify-center rounded-card border-2 border-surface-2 font-bold">Abbrechen</Link>
          </>
        )}
        {state.step === "done" && gameLink(state.gameId, "Zurück zum Spiel")}
        {(state.step === "noGame" || state.step === "error") && (
          <Link href="/" className="inline-flex h-15 items-center justify-center rounded-card bg-primary text-lg font-bold text-on-accent">Zur Startseite</Link>
        )}
      </div>
    </Screen>
  );
}
