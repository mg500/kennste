"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/** Code input that checks the game exists and navigates to it. */
export function JoinCodeForm({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = code.trim().toLowerCase();
    if (!id || loading) return;
    setLoading(true);
    const res = await fetch(`/api/game/${encodeURIComponent(id)}`).catch(() => null);
    if (res?.ok) {
      router.push(`/game/${id}`);
    } else {
      setError("Kein Spiel mit diesem Code gefunden");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={join} className="flex flex-col gap-3">
      <label htmlFor="join-code" className="text-base font-bold">Spiel beitreten</label>
      <div className="flex gap-2.5">
        <input id="join-code" value={code} autoFocus={autoFocus} maxLength={6} autoComplete="off" autoCapitalize="none"
          onChange={e => { setCode(e.target.value); setError(null); }}
          placeholder="Code, z. B. k7q2zx" aria-invalid={!!error} aria-describedby={error ? "join-error" : undefined}
          className="h-13 min-w-0 flex-1 rounded-2xl border-2 border-surface-2 bg-bg px-4 text-lg tracking-widest text-text placeholder:tracking-normal placeholder:text-muted focus:border-primary focus:outline-none aria-[invalid=true]:border-buzz" />
        <Button type="submit" variant="secondary" disabled={!code.trim() || loading} className="h-13">
          {loading ? "…" : "Los"}
        </Button>
      </div>
      {error
        ? <p id="join-error" className="text-sm font-bold text-buzz">{error}</p>
        : <p className="text-sm text-muted">Zum Mitspielen brauchst du keinen Account.</p>}
    </form>
  );
}
