"use client";

import Link from "next/link";
import { Check, Crown } from "lucide-react";
import { Avatar } from "@/components/ui/primitives";
import { MODES } from "@/lib/game/modes";
import type { EveningGame, Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { Cover } from "./End";
import { EveningSongs } from "./EveningSongs";
import { findPlayer, MenuOrTheme, playerColor, Screen } from "./shared";

/** Who won the most games tonight (team games don't count); null if nobody won one. */
export function mostWins(games: EveningGame[]): { names: string[]; wins: number } | null {
  const wins = new Map<string, number>();
  for (const g of games) {
    const best = g.ranking[0]?.score ?? 0;
    if (g.team || best <= 0) continue;
    for (const r of g.ranking) if (r.score === best) wins.set(r.name, (wins.get(r.name) ?? 0) + 1);
  }
  const most = Math.max(0, ...wins.values());
  return most ? { names: [...wins].filter(([, n]) => n === most).map(([name]) => name), wins: most } : null;
}

const listNames = (names: string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;

/** A player's color by name (the evening keeps names; players who left get the first color). */
function colorOf(game: Game, name: string) {
  const player = [...game.players, ...(game.viewerPlayers ?? [])].find(p => p.name === name);
  return playerColor(game, player?.id ?? "");
}

function useSummary(game: Game) {
  const evening = game.evening!;
  const top = mostWins(evening.games);
  const count = evening.games.length;
  return {
    games: evening.games,
    stats: `${count} ${count === 1 ? "Spiel" : "Spiele"} · ${evening.songs.length} ${evening.songs.length === 1 ? "Song" : "Songs"} · ${game.players.length} Spieler`,
    top: top && {
      names: top.names,
      text: `${listNames(top.names)} · ${top.names.length > 1 ? "je " : ""}${top.wins} von ${count} ${count === 1 ? "Spiel" : "Spielen"}`,
    },
  };
}

/**
 * After the host closed the lobby: the evening at a glance for everyone – every game with its result, who won the
 * most, the songs (the host can still save them as a playlist). On the TV, see TvEveningEnd.
 */
export function EveningEnd({ game, myId, controls }: { game: Game; myId?: string; controls?: GameControls }) {
  const { games, stats, top } = useSummary(game);
  return (
    <Screen desktop header={
      <div className="flex items-center justify-between">
        <span className="inline-flex h-9 items-center rounded-full bg-surface px-3.5 text-sm font-bold lg:h-11 lg:px-5 lg:text-base">Lobby geschlossen</span>
        <MenuOrTheme />
      </div>
    }>
      <div className="flex flex-1 flex-col gap-3.5 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-12">
        <div className="flex flex-col gap-3.5 lg:gap-5.5">
          <div className="flex flex-col items-center gap-1 pt-1.5 text-center lg:items-start lg:text-left">
            <h1 className="font-display text-[34px] leading-tight font-extrabold lg:text-[72px] lg:leading-[0.95]">Das war der Abend!</h1>
            <p className="text-muted lg:text-xl">{stats}</p>
          </div>
          {top && (
            <div className="flex items-center gap-3 rounded-card bg-primary p-3.5 pr-4 text-on-accent lg:self-start lg:pr-5.5">
              <span className="flex -space-x-3">
                {top.names.map(name => <span key={name} className="rounded-full ring-3 ring-[currentColor]"><Avatar name={name} color={colorOf(game, name)} size={52} /></span>)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-bold opacity-75 lg:text-sm">Meiste Siege</span>
                <strong className="text-[19px] lg:text-[22px]">{top.text}</strong>
              </span>
              <Crown size={28} strokeWidth={2.4} aria-hidden className="shrink-0" />
            </div>
          )}
          <h2 className="mt-1 font-bold lg:text-xl">Die Spiele</h2>
          <ol className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
            {games.map((g, i) => <GameCard key={i} game={game} played={g} n={i + 1} />)}
          </ol>
          <div className="hidden flex-1 lg:block" />
          <Link href="/" className="hidden h-15 items-center self-start rounded-card bg-primary px-9 text-lg font-bold text-on-accent shadow-[0_5px_0_var(--primary-shade)] lg:inline-flex">Zur Startseite</Link>
        </div>
        <EveningSongs game={game} myId={myId} controls={controls} inline />
      </div>
      <div className="flex-1 lg:hidden" />
      <div className="sticky bottom-0 -mb-6 bg-bg pt-3 pb-6 shadow-[0_-16px_24px_var(--bg)] lg:hidden">
        <Link href="/" className="flex h-14.5 items-center justify-center rounded-card bg-primary text-lg font-bold text-on-accent shadow-[0_5px_0_var(--primary-shade)]">Zur Startseite</Link>
      </div>
    </Screen>
  );
}

const TINTS = ["bg-buzz", "bg-[var(--p3)]", "bg-positive"];

function GameCard({ game, played, n, large }: { game: Game; played: EveningGame; n: number; large?: boolean }) {
  return (
    <li className={`flex flex-col rounded-card bg-surface ${large ? "gap-3.5 rounded-[28px] p-5.5" : "gap-2.5 p-3.5 lg:gap-3 lg:rounded-[22px] lg:p-4.5"}`}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={`inline-flex shrink-0 items-center justify-center font-extrabold text-on-accent ${TINTS[(n - 1) % TINTS.length]} ${large ? "h-10 w-10 rounded-xl text-xl" : "h-6.5 w-6.5 rounded-lg text-[13px] lg:h-7.5 lg:w-7.5"}`}>{n}</span>
        <span className={`flex min-w-0 flex-1 ${large ? "flex-col" : "items-baseline justify-between gap-2 lg:flex-col lg:items-start lg:gap-0"}`}>
          <strong className={large ? "text-2xl" : "lg:text-[17px]"}>{played.name ?? MODES[played.mode].name}</strong>
          <span className={`text-muted ${large ? "text-[17px]" : "text-[13px]"}`}>{played.songs} {played.songs === 1 ? "Song" : "Songs"}</span>
        </span>
      </div>
      {played.team ? (
        <span className={`inline-flex items-center gap-2 self-start rounded-full bg-surface-2 font-bold ${large ? "h-14.5 px-6 text-[22px]" : "h-10 px-4"}`}>
          {played.team.won ? <><Check size={large ? 24 : 18} strokeWidth={3} className="text-positive-text" aria-hidden />Gemeinsam gewonnen</> : "Gemeinsam verloren"}
        </span>
      ) : (
        <ol className={`flex flex-col ${large ? "gap-2.5" : "gap-1.5 lg:gap-2"}`}>
          {played.ranking.slice(0, 3).map((r, i) => (
            <li key={r.name} className={`flex min-w-0 items-center rounded-full font-bold ${i === 0 ? "bg-surface-2" : "bg-bg"} ${large ? "h-14.5 gap-3.5 pr-5 pl-2 text-[22px]" : "h-10 gap-2.5 pr-3.5 pl-1 text-[15px] lg:h-11"}`}>
              <Avatar name={r.name} color={colorOf(game, r.name)} size={large ? 44 : 32} />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className={`font-display font-extrabold tabular-nums ${large ? "text-[26px]" : "lg:text-lg"}`}>{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** The evening's summary on the TV: the games side by side, the songs as a strip of covers. */
export function TvEveningEnd({ game }: { game: Game }) {
  const { games, stats, top } = useSummary(game);
  const host = findPlayer(game, game.hostPlayerId);
  const songs = game.evening!.songs;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-7">
      <div className="flex items-end gap-7">
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="font-display text-[80px] leading-[0.95] font-extrabold tracking-tight">Das war der Abend!</h1>
          <p className="text-[26px] text-muted">{stats}</p>
        </div>
        {top && (
          <div className="flex items-center gap-4 rounded-[26px] bg-primary py-4 pr-6.5 pl-4 text-on-accent">
            <span className="flex -space-x-4">
              {top.names.map(name => <span key={name} className="rounded-full ring-4 ring-[currentColor]"><Avatar name={name} color={colorOf(game, name)} size={68} /></span>)}
            </span>
            <span className="flex flex-col">
              <span className="text-lg font-bold opacity-75">Meiste Siege</span>
              <strong className="text-[30px]">{top.text}</strong>
            </span>
          </div>
        )}
      </div>
      {/* Up to three games big, more of them smaller (up to four side by side) */}
      <ol className="grid min-h-0 flex-1 content-start gap-5.5" style={{ gridTemplateColumns: `repeat(${Math.min(games.length, games.length > 3 ? 4 : 3)}, minmax(0, 1fr))` }}>
        {games.map((g, i) => <GameCard key={i} game={game} played={g} n={i + 1} large={games.length <= 3} />)}
      </ol>
      <div className="flex items-center gap-5.5">
        <span className="flex">
          {songs.slice(0, 8).map(s => <Cover key={s.trackId} src={s.albumArt} className="-mr-3.5 h-18 w-18 rounded-[14px] border-4 border-bg" />)}
        </span>
        <span className="ml-3.5 flex flex-1 flex-col gap-0.5">
          <strong className="text-2xl">Songs des Abends</strong>
          <span className="text-[19px] text-muted">{songs.length} Songs</span>
        </span>
        <span className={`inline-flex h-14 items-center gap-2.5 rounded-full bg-surface px-6 text-xl font-bold ${game.savedPlaylist ? "text-positive-text" : "text-muted"}`}>
          {game.savedPlaylist
            ? <><Check size={22} strokeWidth={3} aria-hidden />{host?.name ?? "Der Host"} hat sie als Playlist gespeichert</>
            : "Noch nicht als Playlist gespeichert"}
        </span>
      </div>
    </div>
  );
}
