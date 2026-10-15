"use client";

import { useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { Crown } from "lucide-react";
import { ReactionsContext, WaitingForNext } from "@/components/game/Continue";
import { getModeUI } from "@/components/game/modes";
import { LoadingSongs, playerColor, roundLabel, Standings, teamOutcome } from "@/components/game/shared";
import { Watch } from "@/components/game/Watch";
import { Decor } from "@/components/ui/Decor";
import { Avatar, Pill } from "@/components/ui/primitives";
import { QrCode } from "@/components/ui/QrCode";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { MODES } from "@/lib/game/modes";
import type { Game } from "@/lib/game/types";
import { useGameSession } from "@/lib/game/useGameSession";

const noSubscribe = () => () => {};

function joinUrl(gameId: string) {
  return typeof window === "undefined" ? `/game/${gameId}` : `${window.location.origin}/game/${gameId}`;
}

function Lobby({ game }: { game: Game }) {
  return (
    <div className="flex flex-1 gap-14">
      <div className="flex flex-1 flex-col justify-center gap-8">
        <span className="text-2xl font-bold text-muted">{MODES[game.mode.id].name}</span>
        <h1 className="font-display text-8xl leading-[0.92] font-extrabold">Erkennst du<br />den Song?</h1>
        <div className="flex flex-wrap gap-3">
          {game.players.map(p => (
            <span key={p.id} className="inline-flex h-16 items-center gap-3 rounded-full bg-surface pr-6 pl-2 text-2xl font-medium">
              <Avatar name={p.name} color={playerColor(game, p.id)} size={48} />{p.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-5">
        <QrCode value={joinUrl(game.id)} size={320} />
        <span className="font-display text-6xl font-extrabold uppercase tracking-[0.12em]">{game.id}</span>
        <span className="text-xl text-muted">Scannen oder Code eingeben</span>
      </div>
    </div>
  );
}

function Finished({ game }: { game: Game }) {
  const team = teamOutcome(game);
  const { TeamSummary } = getModeUI(game.mode.id);
  const best = Math.max(0, ...game.players.map(p => game.scores[p.id] ?? 0));
  const winners = team ? game.players : game.players.filter(p => (game.scores[p.id] ?? 0) === best);
  return (
    <div className="flex flex-1 items-center gap-16">
      <div className="flex flex-1 flex-col items-center gap-6 text-center">
        <div className="flex -space-x-5">
          {winners.map(w => (
            <span key={w.id} className="rounded-full ring-8 ring-bg"><Avatar name={w.name} color={playerColor(game, w.id)} size={180} /></span>
          ))}
        </div>
        {(!team || team.won) && <Crown size={64} className="text-primary" aria-hidden />}
        <h1 className="font-display text-8xl leading-none font-extrabold">
          {team ? team.title : best === 0 ? "Revanche?" : winners.length > 1 ? "Unentschieden!" : `${winners[0].name} gewinnt!`}
        </h1>
        {team && <p className="text-3xl text-muted">{team.subtitle}</p>}
        {game.outOfSongs && <p className="text-2xl text-muted">Playlist durchgespielt</p>}
      </div>
      <div className="w-[440px] rounded-[28px] bg-surface p-5">
        {team && TeamSummary ? <TeamSummary game={game} /> : <Standings game={game} highlight={winners.map(w => w.id)} large />}
      </div>
    </div>
  );
}

/**
 * Watching without joining: the TV view for a TV or projector, and on phones a spectator layout.
 * Only TV views count as "TV-Ansicht verbunden" in the lobby.
 */
export default function ScreenPage() {
  const { id } = useParams<{ id: string }>();
  // Wait for the client so the stream is opened once, with the right role
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const wide = useMediaQuery("(min-width: 1024px)");
  const { game, notFound, playback, reactions } = useGameSession(mounted ? id : null, null, { screen: wide });

  if (mounted && !wide) return <Watch gameId={id} game={game} notFound={notFound} playback={playback} />;
  return (
    <main className="relative flex min-h-dvh w-full overflow-hidden bg-bg px-14 py-12 text-text">
      <Decor variant="wide" />
      <div className="absolute top-5 right-5 z-10 opacity-40 transition-opacity hover:opacity-100"><ThemeToggle compact /></div>
      <div className="relative flex flex-1 flex-col">
        {notFound ? (
          <div className="flex flex-1 items-center justify-center font-display text-6xl font-extrabold">Das Spiel ist vorbei.</div>
        ) : !game ? null
          : game.status === "lobby" ? <Lobby game={game} />
          : game.status === "finished" ? <Finished game={game} />
          : <ReactionsContext value={reactions}><Playing game={game} playback={playback} /></ReactionsContext>}
      </div>
      {game && <LoadingSongs game={game} large />}
    </main>
  );
}

function Playing({ game, playback }: { game: Game; playback: ReturnType<typeof useGameSession>["playback"] }) {
  const ui = getModeUI(game.mode.id);
  return (
    <div className="flex flex-1 gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-7">
        <Pill className="h-12 self-start px-5 text-xl">{roundLabel(game)}</Pill>
        <ui.Screen game={game} playback={playback} />
        <WaitingForNext game={game} />
      </div>
      <div className="w-[380px] shrink-0 self-start rounded-[28px] bg-surface p-5">
        <h2 className="mb-2 text-xl font-bold">Punktestand</h2>
        <Standings game={game} large animate />
      </div>
    </div>
  );
}
