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
import { createHostedGame, fetchPlayerSetup, saveCredentials, type HostGame } from "@/lib/game/client";
import { MODES, type ModeId } from "@/lib/game/modes";

/** Card colors for the "Spiel erstellen" buttons, in mode order. */
const MODE_COLORS = ["bg-buzz", "bg-positive"];

function Header() {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[15px] font-bold tracking-wide lg:text-[17px]">Kennste?!</span>
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

  // Music already playing on a controllable device → straight into the game, otherwise set it up first
  const createGame = async (mode: ModeId) => {
    setCreating(mode);
    const player = (await fetchPlayerSetup())?.player;
    if (!player?.isPlaying || !player.device || player.device.isRestricted) return router.push(`/setup?mode=${mode}`);
    const game = await createHostedGame(mode, player.device.id);
    if (game) openGame(game);
    else setCreating(null);
  };

  if (status === "loading") {
    return <Screen desktop decor="corner"><Header /></Screen>;
  }

  if (!session) {
    return (
      <Screen desktop decor="corner">
        <Header />
        <div className="flex flex-1 flex-col justify-end gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_460px] lg:items-end lg:gap-20">
          <div className="flex flex-col gap-7 lg:gap-9 lg:pb-2">
            <div className="flex flex-col gap-3 lg:gap-5">
              <h1 className="font-display text-[52px] leading-[0.98] font-extrabold tracking-tight lg:text-[120px] lg:leading-[0.92]">Hör hin.<br />Rate mit.</h1>
              <p className="text-lg leading-relaxed text-muted lg:max-w-[520px] lg:text-[21px]">Das Musikquiz für gesellige Runden. Hört gemeinsam Musik, ratet mit und nutzt eure Handys als Buzzer.</p>
            </div>
            <Button size="lg" block onClick={() => signIn("spotify")} className="lg:w-auto lg:self-start lg:px-8 lg:text-xl">
              <LogIn size={22} aria-hidden />Login mit Spotify
            </Button>
          </div>
          <div className="rounded-card bg-surface p-5 lg:rounded-[28px] lg:p-7">
            <JoinCodeForm large />
          </div>
        </div>
      </Screen>
    );
  }

  const firstName = session.user?.name?.split(" ")[0];
  const links = (
    <>
      <Link href="/game" className="py-2 text-center text-muted hover:text-text">Mit Code beitreten</Link>
      <button onClick={() => signOut()} className="h-11 self-center px-4 text-muted hover:text-text lg:px-0">Abmelden</button>
    </>
  );
  return (
    <Screen desktop decor="corner">
      <Header />
      <div className="flex flex-1 flex-col justify-end gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_560px] lg:items-end lg:gap-16">
        <div className="flex flex-col gap-4 lg:gap-6 lg:pb-2">
          <h1 className="mb-2 font-display text-[40px] leading-none font-extrabold tracking-tight lg:mb-0 lg:text-8xl">Hey{firstName ? ` ${firstName}` : ""}!</h1>

          {activeGame && (
            <button onClick={() => openGame(activeGame)}
              className="flex items-center justify-between gap-3 rounded-card bg-primary p-5 text-left font-bold text-on-accent lg:min-w-[460px] lg:self-start lg:rounded-3xl lg:px-6.5">
              <span className="flex flex-col">
                <span className="text-lg lg:text-xl">Laufendes Spiel fortsetzen</span>
                <span className="text-sm font-medium uppercase tracking-widest">{activeGame.gameId}</span>
              </span>
              <ArrowRight size={22} aria-hidden />
            </button>
          )}

          <div className="hidden items-center gap-5 lg:flex">{links}</div>
        </div>

        <div className="flex flex-col gap-4 lg:gap-4.5">
          <Link href="/now-playing" className="flex items-center gap-4 rounded-card bg-surface p-4.5 text-text lg:gap-5 lg:rounded-[28px] lg:p-5.5">
            <span className="inline-flex h-18 w-18 shrink-0 items-center justify-center rounded-2xl bg-info text-on-accent lg:h-21 lg:w-21">
              <Music size={30} aria-hidden />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-lg font-bold lg:text-[21px]">Just Playing</span>
              <span className="text-sm text-muted lg:text-base">Was gerade auf deinem Spotify läuft</span>
            </span>
          </Link>

          <div className="flex flex-col gap-3.5 rounded-card bg-surface p-4.5 lg:gap-4 lg:rounded-[28px] lg:p-5.5">
            <span className="text-lg font-bold lg:text-[21px]">Spiel erstellen</span>
            <div className="grid grid-cols-2 gap-2.5 lg:gap-3">
              {(Object.keys(MODES) as ModeId[]).map((id, i) => {
                const ui = getModeUI(id);
                return (
                  <button key={id} onClick={() => createGame(id)} disabled={!!creating}
                    className={`flex h-24 flex-col justify-between rounded-2xl p-3.5 text-left font-bold text-on-accent disabled:opacity-60 lg:h-32 lg:rounded-[20px] lg:p-4.5 ${MODE_COLORS[i % MODE_COLORS.length]}`}>
                    <ui.icon size={22} aria-hidden />
                    <span className="flex flex-col gap-0.5">
                      <span className="leading-tight text-balance lg:text-[19px]">{creating === id ? "Wird erstellt…" : MODES[id].name}</span>
                      <span className="hidden text-sm font-medium lg:block">{ui.tagline}</span>
                    </span>
                  </button>
                );
              })}
              {UPCOMING_MODES.map(name => (
                <div key={name} className="flex h-24 flex-col justify-between rounded-2xl border-2 border-dashed border-surface-2 px-3.5 py-3 font-bold text-muted lg:h-32">
                  <span className="text-xs uppercase tracking-wider">Bald</span>
                  {name}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:hidden">{links}</div>
      </div>
    </Screen>
  );
}
