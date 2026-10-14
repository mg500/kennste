"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MonitorPlay, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/hotkeys";

/**
 * Code input that checks the game exists and opens it — to play along or as a big screen.
 * `large` scales it up on desktop layouts.
 */
export function JoinCodeForm({ autoFocus, large }: { autoFocus?: boolean; large?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"play" | "screen" | null>(null);

  const open = async (as: "play" | "screen") => {
    const id = code.trim().toLowerCase();
    if (!id || loading) return;
    setLoading(as);
    const res = await fetch(`/api/game/${encodeURIComponent(id)}`).catch(() => null);
    if (res?.ok) {
      router.push(as === "screen" ? `/game/${id}/screen` : `/game/${id}`);
    } else {
      setError("Kein Spiel mit diesem Code gefunden");
      setLoading(null);
    }
  };

  return (
    <form onSubmit={e => { e.preventDefault(); open("play"); }} className={`flex flex-col gap-3 ${large ? "lg:gap-4" : ""}`}>
      <label htmlFor="join-code" className={`text-base font-bold ${large ? "lg:font-display lg:text-[28px] lg:font-extrabold" : ""}`}>Spiel beitreten</label>
      <input id="join-code" value={code} autoFocus={autoFocus} maxLength={6} autoComplete="off" autoCapitalize="none"
        onChange={e => { setCode(e.target.value); setError(null); }}
        placeholder="Code, z. B. k7q2zx" aria-invalid={!!error} aria-describedby={error ? "join-error" : "join-hint"}
        className={`h-13 w-full rounded-2xl border-2 border-surface-2 bg-bg px-4 text-lg tracking-widest text-text placeholder:tracking-normal placeholder:text-muted focus:border-primary focus:outline-none aria-[invalid=true]:border-buzz ${large ? "lg:h-16 lg:px-5 lg:text-2xl lg:font-bold lg:uppercase lg:placeholder:normal-case lg:placeholder:font-normal lg:placeholder:text-lg" : ""}`} />
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="submit" variant="secondary" disabled={!code.trim() || !!loading} className={large ? "lg:h-14 lg:text-lg" : ""}>
          <UserPlus size={18} aria-hidden />{loading === "play" ? "…" : "Mitspielen"}<Kbd>Enter</Kbd>
        </Button>
        <Button type="button" variant="outline" disabled={!code.trim() || !!loading} onClick={() => open("screen")} className={large ? "lg:h-14 lg:text-lg" : ""}>
          <MonitorPlay size={18} aria-hidden />{loading === "screen" ? "…" : "Großbild"}
        </Button>
      </div>
      {error
        ? <p id="join-error" className="text-sm font-bold text-buzz">{error}</p>
        : <p id="join-hint" className="text-sm text-muted">Mitspielen geht ohne Account. „Großbild“ zeigt das Spiel auf einem Laptop oder TV.</p>}
    </form>
  );
}
