"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Crosshair, Crown, Disc3, Flame, Gavel, Heart, Hourglass, Medal, MoveHorizontal, Rocket, Target, TrendingUp, Zap } from "lucide-react";
import { Avatar } from "@/components/ui/primitives";
import { useSwipeTabs } from "@/components/ui/useSwipeTabs";
import { computeAwards, playedSongs, type Award, type AwardId } from "@/lib/game/awards";
import { getMode } from "@/lib/game/modes";
import type { Game, Player, RoundRecord } from "@/lib/game/types";
import { getModeUI } from "./modes";
import { findPlayer, playerColor, scoreText, teamOutcome } from "./shared";

// ── The end of a game: winner, podium, awards and every song played ──

const ICONS: Record<AwardId, LucideIcon> = {
  fast: Zap, streak: Flame, comeback: TrendingUp, brave: Rocket, honest: Heart, jury: Gavel, dj: Disc3,
  bullseye: Target, close: Crosshair, timeTraveler: Hourglass, first: Medal, boldGap: MoveHorizontal,
};
const TINTS = ["bg-primary", "bg-info", "bg-buzz", "bg-positive"];

/** Everything the end screens show, derived from the finished game. */
export function useEnd(game: Game, myId?: string) {
  const team = teamOutcome(game);
  const best = Math.max(0, ...game.players.map(p => game.scores[p.id] ?? 0));
  const winners = team ? game.players : game.players.filter(p => (game.scores[p.id] ?? 0) === best);
  const title = team ? team.title
    : best === 0 ? "Keine Punkte – Revanche?"
    : winners.length > 1 ? "Unentschieden!"
    : winners[0].id === myId ? "Du gewinnst!" : `${winners[0].name} gewinnt!`;
  const songs = playedSongs(game);
  const right = songs.filter(s => s.scorers.length).length;
  const subtitle = team ? team.subtitle
    : [scoreText(game, best), `${songs.length} Songs`, getMode(game.mode.id).name].join(" · ");
  return { team, winners, title, subtitle, awards: computeAwards(game), songs, right };
}

/** Players by score, each with their place (ties share a place). */
function ranking(game: Game) {
  const sorted = [...game.players].sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0));
  return sorted.map(p => ({ player: p, score: game.scores[p.id] ?? 0, place: 1 + sorted.filter(o => (game.scores[o.id] ?? 0) > (game.scores[p.id] ?? 0)).length }));
}

/** The best three on a podium (second, first, third), everyone else in rows below. */
export function Podium({ game, size = "md" }: { game: Game; size?: "md" | "lg" | "xl" }) {
  const ranked = ranking(game);
  const top = ranked.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const heights = { 1: [118, 128, 240], 2: [84, 92, 168], 3: [62, 70, 124] } as const;
  const dims = { md: { w: "w-26", avatar: [68, 56], name: "text-[15px]", score: "text-[26px]", h: 0 }, lg: { w: "w-29", avatar: [72, 58], name: "text-base", score: "text-3xl", h: 1 }, xl: { w: "w-55", avatar: [120, 96], name: "text-[26px]", score: "text-[56px]", h: 2 } }[size];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-center gap-2 lg:gap-2.5" aria-label="Podest">
        {order.map(({ player, score, place }) => {
          const first = place === 1;
          return (
            <div key={player.id} className={`flex flex-col items-center gap-1.5 ${dims.w}`}>
              {first && <Crown size={size === "xl" ? 54 : 26} className="text-primary-text" aria-hidden />}
              <span className="rounded-full ring-4 ring-bg"><Avatar name={player.name} color={playerColor(game, player.id)} size={dims.avatar[first ? 0 : 1]} /></span>
              <span className={`font-bold ${dims.name}`}>{player.name}</span>
              <div className={`flex w-full flex-col items-center rounded-t-2xl pt-2.5 ${first ? "bg-primary text-on-accent" : "bg-surface-2"}`}
                style={{ height: heights[Math.min(place, 3) as 1 | 2 | 3][dims.h] }}>
                <span className={`font-display leading-none font-extrabold tabular-nums ${dims.score}`}>{score}</span>
                <span className={`font-bold opacity-75 ${size === "xl" ? "text-xl" : "text-xs"}`}>{place}.</span>
              </div>
            </div>
          );
        })}
      </div>
      {ranked.length > 3 && (
        <ol className="flex flex-col gap-1.5" start={4}>
          {ranked.slice(3).map(({ player, score, place }) => (
            <li key={player.id} className={`flex items-center gap-2.5 rounded-xl bg-surface px-3.5 ${size === "xl" ? "h-16 text-2xl" : "h-12"}`}>
              <span className="w-6 text-sm font-bold text-muted">{place}</span>
              <Avatar name={player.name} color={playerColor(game, player.id)} size={size === "xl" ? 44 : 28} />
              <span className="flex-1 font-medium">{player.name}</span>
              <span className={`font-display font-extrabold tabular-nums ${size === "xl" ? "text-3xl" : "text-xl"}`}>{score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AwardIcon({ award, index, size }: { award: Award; index: number; size: number }) {
  const Icon = ICONS[award.id];
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-[30%] text-on-accent ${TINTS[index % TINTS.length]}`}
      style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.4} />
    </span>
  );
}

const names = (game: Game, ids: string[]) => ids.map(id => findPlayer(game, id)?.name ?? "?").join(" & ");

function Winners({ game, ids, size }: { game: Game; ids: string[]; size: number }) {
  return (
    <span className="flex -space-x-2">
      {ids.map(id => {
        const p = findPlayer(game, id);
        return p && <span key={id} className="rounded-full ring-2 ring-surface"><Avatar name={p.name} color={playerColor(game, id)} size={size} /></span>;
      })}
    </span>
  );
}

/** Awards: a row of small cards (`strip`), a list (`list`, phone), a grid (`grid`, laptop) or big cards (`tv`). */
export function Awards({ game, awards, variant }: { game: Game; awards: Award[]; variant: "strip" | "list" | "grid" | "tv" }) {
  if (variant === "strip") {
    return (
      <ul className="-mr-5 flex snap-x gap-2.5 overflow-x-auto pr-5 pb-1" aria-label="Auszeichnungen">
        {awards.map((a, i) => (
          <li key={a.id} className="flex w-38 shrink-0 snap-start flex-col gap-1.5 rounded-2xl bg-surface p-3">
            <AwardIcon award={a} index={i} size={34} />
            <span className="font-bold">{a.title}</span>
            <span className="text-[13px] text-muted">{names(game, a.playerIds)} · {a.fact}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (variant === "tv") {
    return (
      <ul className="grid grid-cols-3 content-start gap-5" aria-label="Auszeichnungen">
        {awards.map((a, i) => (
          <li key={a.id} className="bubble-in flex flex-col gap-3.5 rounded-[28px] bg-surface p-6" style={{ animationDelay: `${i * 450}ms` }}>
            <div className="flex items-center justify-between">
              <AwardIcon award={a} index={i} size={64} />
              <span className="flex items-center gap-2.5 text-2xl font-bold">
                <Winners game={game} ids={a.playerIds} size={48} />{names(game, a.playerIds)}
              </span>
            </div>
            <span className="font-display text-4xl leading-none font-extrabold">{a.title}</span>
            <span className="text-xl text-muted">{a.fact}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={variant === "grid" ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2.5"} aria-label="Auszeichnungen">
      {awards.map((a, i) => (
        <li key={a.id} className={`flex items-center gap-3 rounded-[18px] bg-surface ${variant === "grid" ? "p-4" : "px-3.5 py-3"}`}>
          <AwardIcon award={a} index={i} size={variant === "grid" ? 48 : 44} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-bold lg:text-lg">{a.title}{variant === "grid" && <> · {names(game, a.playerIds)}</>}</span>
            <span className="text-[13px] text-muted lg:text-[15px]">{a.fact}</span>
          </span>
          {variant === "list" && <Winners game={game} ids={a.playerIds} size={32} />}
        </li>
      ))}
    </ul>
  );
}

function Scorers({ game, ids, size }: { game: Game; ids: string[]; size: number }) {
  if (!ids.length) {
    return <span role="img" aria-label="Niemand hat ihn erraten" className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-surface-2 text-sm font-bold text-muted" style={{ width: size, height: size }}>–</span>;
  }
  return (
    <span role="img" aria-label={`Erraten von ${names(game, ids)}`} className="flex shrink-0 -space-x-2">
      {ids.slice(0, 3).map(id => {
        const p = findPlayer(game, id);
        return p && <span key={id} className="rounded-full ring-2 ring-bg"><Avatar name={p.name} color={playerColor(game, id)} size={size} /></span>;
      })}
    </span>
  );
}

const spotifyUrl = (trackId: string) => `https://open.spotify.com/track/${trackId}`;

export function Cover({ src, className }: { src: string | null; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={`shrink-0 object-cover ${className}`} /> : <span className={`shrink-0 bg-surface-2 ${className}`} />;
}

/** Every song as a row; tapping one opens it in Spotify. With `scorers`, who guessed it. */
export function SongList({ game, songs }: { game: Game; songs: { song: RoundRecord["song"]; scorers?: string[] }[] }) {
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Alle Songs">
      {songs.map(({ song, scorers }) => (
        <li key={song.trackId}>
          <a href={spotifyUrl(song.trackId)} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 rounded-[14px] bg-surface p-1.5 pr-2.5 hover:brightness-110 lg:bg-transparent lg:hover:bg-surface-2">
            <Cover src={song.albumArt} className="h-11 w-11 rounded-[10px]" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-bold">{song.name}</span>
              <span className="truncate text-[13px] text-muted lg:text-sm">{song.artist}{song.releaseYear && ` · ${song.releaseYear.slice(0, 4)}`}</span>
            </span>
            {scorers && <Scorers game={game} ids={scorers} size={28} />}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** The songs as a grid of covers for the TV. */
function SongGrid({ game, songs }: { game: Game; songs: ReturnType<typeof playedSongs> }) {
  return (
    <ol className="grid grid-cols-5 content-start gap-x-5 gap-y-4" aria-label="Alle Songs">
      {songs.slice(0, 10).map(({ song, scorers }) => (
        <li key={song.trackId} className="flex min-w-0 flex-col gap-2.5">
          <span className="relative block aspect-square w-full max-w-50">
            <Cover src={song.albumArt} className="h-full w-full rounded-[20px]" />
            <span className="absolute right-2.5 bottom-2.5"><Scorers game={game} ids={scorers} size={44} /></span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-bold">{song.name}</span>
            <span className="truncate text-muted">{song.artist}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

type Tab = "standings" | "awards" | "songs";

/**
 * The end screen for players (and spectators on a phone): on phones as tabs (Endstand, Auszeichnungen, Songs),
 * on laptops all at once. `actions` goes at the bottom (host: new game; others: waiting for a rematch),
 * `songActions` below the songs (host: where to save them).
 */
export function EndContent({ game, myId, actions, songActions }: { game: Game; myId?: string; actions: ReactNode; songActions?: ReactNode }) {
  const end = useEnd(game, myId);
  const { TeamSummary } = getModeUI(game.mode.id);
  const [tab, setTab] = useState<Tab>("standings");
  const tabs: [Tab, string][] = [["standings", "Endstand"], ...(end.awards.length ? [["awards", "Auszeichnungen"] as [Tab, string]] : []), ["songs", "Songs"]];
  const show = (t: Tab) => (tab === t ? "flex" : "hidden lg:flex");
  const swipe = useSwipeTabs(tabs.map(([id]) => id), tab, setTab);

  const headline = (
    <div className="flex flex-col items-center gap-1 text-center lg:items-start lg:text-left">
      <h1 className="font-display text-[34px] leading-tight font-extrabold lg:text-[72px] lg:leading-[0.95]">{end.title}</h1>
      <p className="text-muted lg:text-xl">{end.subtitle}</p>
    </div>
  );

  return (
    <>
      <div role="tablist" className="grid gap-1 rounded-full bg-surface p-1 lg:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`h-9.5 rounded-full text-sm font-bold ${tab === id ? "bg-surface-2 text-text" : "text-muted"}`}>{label}</button>
        ))}
      </div>

      {/* Takes up all the free space: swiping works below short content too */}
      <div {...swipe} className="flex flex-1 flex-col gap-3.5 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-12">
        <div className="flex flex-col gap-3.5 lg:gap-5">
          <div className={`${show("standings")} flex-col gap-4 lg:gap-6`}>
            {headline}
            <div className="lg:self-start">
              {end.team && TeamSummary ? <TeamSummary game={game} />
                : <><span className="lg:hidden"><Podium game={game} /></span><span className="hidden lg:block"><Podium game={game} size="lg" /></span></>}
            </div>
          </div>
          {end.awards.length > 0 && (
            <>
              <div className={`${tab === "standings" ? "flex" : "hidden"} flex-col gap-2.5 lg:hidden`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-bold">Auszeichnungen</span>
                  {end.awards.length > 3 && <button onClick={() => setTab("awards")} className="text-sm text-muted">Alle {end.awards.length}</button>}
                </div>
                <Awards game={game} awards={end.awards.slice(0, 3)} variant="strip" />
              </div>
              <div className={`${show("awards")} flex-col gap-2.5`}>
                <span className="text-muted lg:text-xl lg:font-bold lg:text-text">
                  <span className="lg:hidden">Was den Abend ausgemacht hat</span><span className="hidden lg:inline">Auszeichnungen</span>
                </span>
                <span className="lg:hidden"><Awards game={game} awards={end.awards} variant="list" /></span>
                <span className="hidden lg:block"><Awards game={game} awards={end.awards} variant="grid" /></span>
              </div>
            </>
          )}
          <div className="hidden flex-1 lg:block" />
          <div className="hidden lg:block">{actions}</div>
        </div>

        <div className={`${show("songs")} min-h-0 flex-col gap-3 lg:rounded-[28px] lg:bg-surface lg:p-5.5`}>
          <div className="flex items-baseline justify-between">
            <span className="text-muted lg:text-xl lg:font-bold lg:text-text">
              <span className="lg:hidden">{end.songs.length} Songs · {end.right} erraten</span><span className="hidden lg:inline">Die Songs</span>
            </span>
            <span className="text-[13px] text-muted lg:text-[15px]">
              <span className="lg:hidden">Antippen öffnet Spotify</span><span className="hidden lg:inline">{end.songs.length} Songs · {end.right} erraten</span>
            </span>
          </div>
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"><SongList game={game} songs={end.songs} /></div>
          {songActions}
        </div>
      </div>

      <div className="sticky bottom-0 -mb-6 flex flex-col gap-2 bg-bg pt-3 pb-6 shadow-[0_-16px_24px_var(--bg)] lg:hidden">
        {actions}
      </div>
    </>
  );
}

const TV_PART_MS = 10_000;

/** The end on the TV: podium, awards and songs, one after another. */
export function TvEnd({ game }: { game: Game }) {
  const end = useEnd(game);
  const { TeamSummary } = getModeUI(game.mode.id);
  const parts = (["podium", end.awards.length && "awards", end.songs.length && "songs"] as const).filter(Boolean) as ("podium" | "awards" | "songs")[];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (parts.length < 2) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % parts.length), TV_PART_MS);
    return () => clearInterval(timer);
  }, [parts.length]);
  const part = parts[index % parts.length];
  const host: Player | undefined = findPlayer(game, game.hostPlayerId);

  return (
    <div className="flex flex-1 flex-col gap-7">
      {part === "podium" && (
        <div key="podium" className="flex flex-1 gap-16">
          <div className="flex flex-1 flex-col gap-2.5">
            <h1 className="bubble-in font-display text-8xl leading-[0.95] font-extrabold tracking-tight">{end.title}</h1>
            <p className="text-[28px] text-muted">{end.subtitle}</p>
            <div className="flex flex-1 items-end justify-center">
              {end.team && TeamSummary ? <TeamSummary game={game} /> : <Podium game={game} size="xl" />}
            </div>
          </div>
        </div>
      )}
      {part === "awards" && (
        <div key="awards" className="flex flex-1 flex-col gap-7">
          <h1 className="font-display text-7xl leading-none font-extrabold">Auszeichnungen</h1>
          <Awards game={game} awards={end.awards} variant="tv" />
        </div>
      )}
      {part === "songs" && (
        <div key="songs" className="flex flex-1 flex-col gap-7">
          <div className="flex items-baseline gap-6">
            <h1 className="font-display text-7xl leading-none font-extrabold">Die Songs</h1>
            <span className="text-[26px] text-muted">{end.songs.length} Songs · {end.right} erraten</span>
          </div>
          <SongGrid game={game} songs={end.songs} />
        </div>
      )}
      <div className="flex items-center gap-3.5">
        {parts.length > 1 && parts.map((p, i) => (
          <span key={p} className={`h-2.5 rounded-full transition-all ${i === index % parts.length ? "w-10 bg-text" : "w-2.5 bg-surface-2"}`} />
        ))}
        <span className="text-lg text-muted">{parts.length > 1 ? "wechselt von selbst · " : ""}Warte auf {host?.name ?? "den Host"} für eine Revanche</span>
      </div>
    </div>
  );
}
