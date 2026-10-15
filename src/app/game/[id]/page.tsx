"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Eye, MonitorPlay } from "lucide-react";
import { GameView } from "@/components/game/GameView";
import { Screen } from "@/components/game/shared";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { loadCredentials, saveCredentials, type Credentials } from "@/lib/game/client";
import { useGameSession } from "@/lib/game/useGameSession";

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Screen decor="corner">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        {children}
      </div>
    </Screen>
  );
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // undefined until restored from sessionStorage
  const [creds, setCreds] = useState<Credentials | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const { game, notFound, playback, notice, reactions, controls, applyGame } = useGameSession(id, creds ?? null);

  // Restore credentials after a reload (sessionStorage is only available on the client).
  // Without saved credentials, the host can recover theirs from the Spotify session (new tab/device).
  useEffect(() => {
    const saved = loadCredentials(id);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from sessionStorage
      setCreds(saved);
      return;
    }
    let cancelled = false;
    fetch("/api/game/my")
      .then(r => (r.ok ? r.json() : null))
      .then((data: { gameId: string; playerId: string; token: string } | null) => {
        if (cancelled) return;
        if (data?.gameId !== id) { setCreds(null); return; }
        const hostCreds = { playerId: data.playerId, token: data.token };
        saveCredentials(id, hostCreds);
        setCreds(hostCreds);
      })
      .catch(() => { if (!cancelled) setCreds(null); });
    return () => { cancelled = true; };
  }, [id]);

  const updateCreds = (next: Credentials | null) => {
    saveCredentials(id, next);
    setCreds(next);
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    const res = await fetch(`/api/game/${id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) {
      updateCreds({ playerId: data.playerId, token: data.token });
      applyGame(data.game);
    } else {
      setJoinError(data?.error ?? "Beitreten fehlgeschlagen");
    }
    setJoining(false);
  };

  if (notFound) {
    return (
      <Message title="Das Spiel ist vorbei">
        <p className="text-muted">Dieses Spiel gibt es nicht (mehr).</p>
        <Link href="/" className="font-bold text-primary">Zur Startseite</Link>
      </Message>
    );
  }
  if (!game || creds === undefined) return <Screen><span className="sr-only">Laden…</span></Screen>;

  const isMember = !!creds && [...game.players, ...(game.viewerPlayers ?? [])].some(p => p.id === creds.playerId);

  if (creds && !isMember) {
    return (
      <Message title={game.status === "lobby" ? "Du wurdest entfernt" : "Du bist nicht mehr dabei"}>
        {game.status === "lobby" && <Button variant="secondary" onClick={() => updateCreds(null)}>Erneut beitreten</Button>}
      </Message>
    );
  }

  if (!creds || !controls) {
    if (game.status !== "lobby") {
      return (
        <Message title="Das Spiel läuft schon">
          <p className="text-muted">Beim nächsten Spiel bist du dabei.</p>
          <Link href={`/game/${id}/screen`} className="font-bold text-primary">
            <span className="lg:hidden">Zuschauen</span><span className="hidden lg:inline">In der TV-Ansicht zuschauen</span>
          </Link>
        </Message>
      );
    }
    return (
      <Screen decor="corner">
        <div className="flex justify-end"><ThemeToggle /></div>
        <form onSubmit={join} className="flex flex-1 flex-col justify-end gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-muted">Spiel {id}</span>
            <h1 className="font-display text-5xl leading-none font-extrabold">Erkennst du den Song?</h1>
          </div>
          <label className="flex flex-col gap-2">
            <span className="font-bold">Dein Name</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={20} autoFocus autoComplete="nickname"
              placeholder="z. B. Lea"
              className="h-14 rounded-2xl border-2 border-surface-2 bg-surface px-4 text-lg text-text placeholder:text-muted focus:border-primary focus:outline-none" />
          </label>
          {joinError && <p className="font-bold text-buzz">{joinError}</p>}
          <Button type="submit" size="lg" block disabled={joining || !name.trim()}>
            {joining ? "Trete bei…" : "Mitspielen"}
          </Button>
          <Link href={`/game/${id}/screen`} className="flex h-12 items-center justify-center gap-2 font-bold text-muted hover:text-text">
            <Eye size={18} aria-hidden className="lg:hidden" /><MonitorPlay size={18} aria-hidden className="hidden lg:block" />
            <span className="lg:hidden">Nur zuschauen</span><span className="hidden lg:inline">Nur die TV-Ansicht öffnen</span>
          </Link>
        </form>
      </Screen>
    );
  }

  return (
    <GameView game={game} controls={controls} myId={creds.playerId} playback={playback} notice={notice} reactions={reactions}
      onEnded={() => router.push("/")} />
  );
}
