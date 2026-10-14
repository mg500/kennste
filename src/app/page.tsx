"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogIn, Music } from "lucide-react";
import { JoinCodeForm } from "@/components/JoinCodeForm";
import { Screen } from "@/components/game/shared";
import { getModeUI, UPCOMING_MODES } from "@/components/game/modes";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { saveCredentials } from "@/lib/game/client";
import { MODES, type ModeId } from "@/lib/game/modes";

interface HostGame { gameId: string; playerId: string; token: string }

function Header() {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[15px] font-bold tracking-wide">Spotify Toolbox</span>
      <ThemeToggle />
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeGame, setActiveGame] = useState<HostGame | null>(null);
  const [creating, setCreating] = useState<ModeId | null>(null);

  // A game this user is hosting (e.g. started on another device or in another tab)
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/game/my")
      .then(r => (r.ok ? r.json() : null))
      .then((data: HostGame | null) => setActiveGame(data))
      .catch(() => {});
  }, [status]);

  const openGame = (game: HostGame) => {
    saveCredentials(game.gameId, { playerId: game.playerId, token: game.token });
    router.push(`/game/${game.gameId}`);
  };

  const createGame = async (mode: ModeId) => {
    setCreating(mode);
    const res = await fetch("/api/game/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      openGame({ gameId: data.game.id, playerId: data.playerId, token: data.token });
    } else {
      setCreating(null);
    }
  };

  if (status === "loading") {
    return <Screen decor="corner"><Header /></Screen>;
  }

  if (!session) {
    return (
      <Screen decor="corner">
        <Header />
        <div className="flex flex-1 flex-col justify-end gap-7">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-[52px] leading-[0.98] font-extrabold tracking-tight">Hör hin.<br />Rate mit.</h1>
            <p className="text-lg leading-relaxed text-muted">Sieh, was gerade läuft – oder starte ein Musikquiz mit deinen Leuten.</p>
          </div>
          <Button size="lg" block onClick={() => signIn("spotify")}>
            <LogIn size={22} aria-hidden />Login mit Spotify
          </Button>
          <div className="rounded-card bg-surface p-5">
            <JoinCodeForm />
          </div>
        </div>
      </Screen>
    );
  }

  const firstName = session.user?.name?.split(" ")[0];
  return (
    <Screen decor="corner">
      <Header />
      <div className="flex flex-1 flex-col justify-end gap-4">
        <h1 className="mb-2 font-display text-[40px] leading-none font-extrabold tracking-tight">Hey{firstName ? ` ${firstName}` : ""}!</h1>

        {activeGame && (
          <button onClick={() => openGame(activeGame)}
            className="flex items-center justify-between gap-3 rounded-card bg-primary p-5 text-left font-bold text-on-accent">
            <span className="flex flex-col">
              <span className="text-lg">Laufendes Spiel fortsetzen</span>
              <span className="text-sm font-medium uppercase tracking-widest">{activeGame.gameId}</span>
            </span>
            <ArrowRight size={22} aria-hidden />
          </button>
        )}

        <Link href="/now-playing" className="flex items-center gap-4 rounded-card bg-surface p-4.5 text-text">
          <span className="inline-flex h-18 w-18 shrink-0 items-center justify-center rounded-2xl bg-info text-on-accent">
            <Music size={30} aria-hidden />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-lg font-bold">Just Playing</span>
            <span className="text-sm text-muted">Was gerade auf deinem Spotify läuft</span>
          </span>
        </Link>

        <div className="flex flex-col gap-3.5 rounded-card bg-surface p-4.5">
          <span className="text-lg font-bold">Spiel erstellen</span>
          <div className="grid grid-cols-2 gap-2.5">
            {(Object.keys(MODES) as ModeId[]).map(id => {
              const ui = getModeUI(id);
              return (
                <button key={id} onClick={() => createGame(id)} disabled={!!creating}
                  className="flex h-24 flex-col justify-between rounded-2xl bg-buzz p-3.5 text-left font-bold text-on-accent disabled:opacity-60">
                  <ui.icon size={22} aria-hidden />
                  {creating === id ? "Wird erstellt…" : MODES[id].name}
                </button>
              );
            })}
            {UPCOMING_MODES.map(name => (
              <div key={name} className="flex h-24 flex-col justify-between rounded-2xl border-2 border-dashed border-surface-2 px-3.5 py-3 font-bold text-muted">
                <span className="text-xs uppercase tracking-wider">Bald</span>
                {name}
              </div>
            ))}
          </div>
        </div>

        <Link href="/game" className="py-2 text-center text-muted hover:text-text">Mit Code beitreten</Link>
        <button onClick={() => signOut()} className="h-11 self-center px-4 text-muted hover:text-text">Abmelden</button>
      </div>
    </Screen>
  );
}
