"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { StageLight } from "@/components/ui/Decor";
import { Avatar, Chip, Pill } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getMode } from "@/lib/game/modes";
import { modeName } from "@/lib/game/modes/groups";
import type { Game } from "@/lib/game/types";
import type { ReceivedPlayback } from "@/lib/game/useGameSession";
import { ruleChips } from "./GameLobby";
import { getModeUI } from "./modes";
import { EndContent } from "./End";
import { EveningEnd } from "./EveningEnd";
import { findPlayer, LoadingSongs, playerColor, roundLabel, Screen, teamOutcome } from "./shared";
import { PointsPop } from "./RoundPoints";
import { Splash } from "./Splash";

function WatchBadge() {
  return (
    <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 border-surface-2 px-3 text-sm font-bold text-muted">
      <Eye size={15} aria-hidden />Zuschauen
    </span>
  );
}

function Header({ label, gameId }: { label?: string; gameId?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <Pill className="shrink-0">{label}</Pill>}
      <WatchBadge />
      {gameId && <span className="text-sm text-muted">Spiel <span className="uppercase">{gameId}</span></span>}
      <div className="flex-1" />
      <ThemeToggle compact />
    </div>
  );
}

function Lobby({ game }: { game: Game }) {
  const host = findPlayer(game, game.hostPlayerId);
  const playing = game.players.filter(p => !game.viewers.includes(p.id));
  return (
    <Screen header={<Header gameId={game.id} />}>
      <div className="flex flex-col gap-1.5 pt-3">
        <span className="font-bold text-muted">{modeName(game.mode)}</span>
        <h1 className="font-display text-5xl leading-[0.95] font-extrabold">Gleich geht&apos;s los</h1>
        <span className="text-muted">Warte auf {host?.name ?? "den Host"} …</span>
      </div>
      <section className="flex flex-col gap-2" aria-labelledby="watch-players">
        <div className="flex items-baseline justify-between">
          <h2 id="watch-players" className="text-lg font-bold">Spieler</h2>
          <span className="text-sm text-muted">{playing.length} spielen</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {playing.map(p => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface py-1.5 pr-3 pl-2">
              <Avatar name={p.name} color={playerColor(game, p.id)} size={36} />
              <span className="flex-1 font-medium">{p.name}</span>
              {p.id === game.hostPlayerId && <span className="text-sm font-bold text-primary-text">Host</span>}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap gap-1.5">
        {ruleChips(game).map(c => <Chip key={c} className="bg-surface">{c}</Chip>)}
      </div>
      <div className="flex-1" />
      <p className="text-center text-sm text-muted">Du schaust nur zu. Noch kannst du einsteigen.</p>
      <Link href={`/game/${game.id}`}
        className="pressable inline-flex h-15 items-center justify-center rounded-card bg-primary text-lg font-bold text-on-accent"
        style={{ "--shade": "var(--primary-shade)" } as React.CSSProperties}>
        Mitspielen
      </Link>
    </Screen>
  );
}

/** Compact standings: every player in one row, best first. */
function ScoreRow({ game }: { game: Game }) {
  const sorted = [...game.players].sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0));
  const unit = getMode(game.mode.id).scoreUnit?.many ?? "Punktestand";
  return (
    <section className="flex flex-col gap-2" aria-label={unit}>
      <h2 className="text-sm font-bold text-muted">{unit}</h2>
      <ol className="grid grid-cols-4 gap-1.5">
        {sorted.map(p => (
          <li key={p.id} className="flex h-12 min-w-0 items-center gap-2 rounded-2xl bg-surface px-2">
            <Avatar name={p.name} color={playerColor(game, p.id)} size={28} />
            <span className="sr-only">{p.name}:</span>
            <span className="font-display text-xl font-extrabold tabular-nums">{game.scores[p.id] ?? 0}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Round({ game, playback }: { game: Game; playback: ReceivedPlayback | null }) {
  const ui = getModeUI(game.mode.id);
  return (
    <Screen header={<Header label={roundLabel(game)} />}>
      <ui.Watch game={game} playback={playback} />
      <div className="flex-1" />
      <ScoreRow game={game} />
    </Screen>
  );
}

function Finished({ game }: { game: Game }) {
  const team = teamOutcome(game);
  const host = findPlayer(game, game.hostPlayerId);
  return (
    <Screen decor={!team || team.won ? "confetti" : undefined} header={<Header label={game.outOfSongs ? "Playlist durchgespielt" : "Spiel vorbei"} />}>
      <EndContent game={game} actions={
        <p className="text-center text-muted">Startet {host?.name ?? "der Host"} eine Revanche, kannst du in der Lobby mitspielen.</p>} />
    </Screen>
  );
}

/** Watching on a phone without joining (the TV view's page below 1024px). */
export function Watch({ gameId, game, notFound, playback }: {
  gameId: string; game: Game | null; notFound: boolean; playback: ReceivedPlayback | null;
}) {
  if (notFound) {
    return (
      <Screen decor="corner" header={<Header gameId={gameId} />}>
        <div className="flex flex-1 items-center justify-center text-center font-display text-3xl font-extrabold">Das Spiel ist vorbei.</div>
      </Screen>
    );
  }
  if (!game) return null;
  if (game.closedAt) return <EveningEnd game={game} />;
  return (
    <StageLight value={game.stageColor}>
      {game.status === "lobby" ? <Lobby game={game} />
        : game.status === "finished" ? <Finished game={game} />
        : <><Round game={game} playback={playback} /><LoadingSongs game={game} /></>}
      <PointsPop game={game} />
      <Splash game={game} />
    </StageLight>
  );
}
