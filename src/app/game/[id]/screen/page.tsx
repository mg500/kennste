"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import { WaitingForNext } from "@/components/game/Continue";
import { TvEnd } from "@/components/game/End";
import { TvEveningEnd } from "@/components/game/EveningEnd";
import { getModeUI } from "@/components/game/modes";
import { ScreenLobby } from "@/components/game/ScreenLobby";
import { Splash } from "@/components/game/Splash";
import { LoadingSongs, roundLabel, Standings } from "@/components/game/shared";
import { Watch } from "@/components/game/Watch";
import { Decor } from "@/components/ui/Decor";
import { Pill } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import type { Game } from "@/lib/game/types";
import { isPairedScreen } from "@/lib/game/screenMode";
import { useGameSession } from "@/lib/game/useGameSession";

/** How long a paired TV shows the evening's summary before it shows a pairing code again (for the next game). */
const CLOSED_SUMMARY_MS = 2 * 60 * 1000;

const noSubscribe = () => () => {};

/**
 * Watching without joining: the TV view for a TV or projector, and on phones a spectator layout.
 * Only TV views count as "TV-Ansicht verbunden" in the lobby.
 */
export default function ScreenPage() {
  const { id } = useParams<{ id: string }>();
  // Wait for the client so the stream is opened once, with the right role
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const wide = useMediaQuery("(min-width: 1024px)");
  const { game, notFound, playback } = useGameSession(mounted ? id : null, null, { screen: wide });
  const router = useRouter();

  // A TV connected via /tv shows the next pairing code once the game is gone – or a while after the lobby closed
  const closed = !!game?.closedAt;
  useEffect(() => {
    if (!isPairedScreen()) return;
    if (notFound) { router.replace("/tv"); return; }
    if (!closed) return;
    const timer = setTimeout(() => router.replace("/tv"), CLOSED_SUMMARY_MS);
    return () => clearTimeout(timer);
  }, [notFound, closed, router]);

  if (mounted && !wide) return <Watch gameId={id} game={game} notFound={notFound} playback={playback} />;
  return (
    <main className="relative flex min-h-dvh w-full overflow-hidden bg-bg px-14 py-12 text-text">
      <Decor variant="wide" />
      <div className="absolute top-5 right-5 z-10 opacity-40 transition-opacity hover:opacity-100"><ThemeToggle compact /></div>
      <div className="relative flex flex-1 flex-col">
        {notFound ? (
          <div className="flex flex-1 items-center justify-center font-display text-6xl font-extrabold">Das Spiel ist vorbei.</div>
        ) : !game ? null
          : game.closedAt ? <TvEveningEnd game={game} />
          : game.status === "lobby" ? <ScreenLobby game={game} playback={playback} />
          : game.status === "finished" ? <TvEnd game={game} />
          : <Playing game={game} playback={playback} />}
      </div>
      {game && <LoadingSongs game={game} large />}
      <Splash game={game} large />
    </main>
  );
}

function Playing({ game, playback }: { game: Game; playback: ReturnType<typeof useGameSession>["playback"] }) {
  const ui = getModeUI(game.mode.id);
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className={`flex gap-10 ${ui.playerCards ? "flex-1" : ""}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-7">
          <Pill className="h-12 self-start px-5 text-xl">{roundLabel(game)}</Pill>
          <ui.Screen game={game} playback={playback} />
          {!ui.ScreenWide && <WaitingForNext game={game} />}
        </div>
        {!ui.playerCards && (
          <div className="w-[380px] shrink-0 self-start rounded-[28px] bg-surface p-5">
            <h2 className="mb-2 text-xl font-bold">Punktestand</h2>
            <Standings game={game} large animate />
          </div>
        )}
      </div>
      {ui.ScreenWide && (
        <>
          <ui.ScreenWide game={game} playback={playback} />
          <WaitingForNext game={game} />
        </>
      )}
    </div>
  );
}
