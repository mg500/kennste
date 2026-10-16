"use client";

import { useEffect, useRef } from "react";
import { ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, useHotkeys } from "@/components/ui/hotkeys";
import { Avatar } from "@/components/ui/primitives";
import { useCountdown } from "@/components/ui/useCountdown";
import { awaitingContinue, CONTINUE_COUNTDOWN_SEC, continueVotesNeeded, continuingPlayer } from "@/lib/game/reducer";
import type { Game, Player } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { findPlayer, playerColor } from "./shared";

/** Who wants to continue, how many votes are needed and how many seconds are left once a majority does. */
function useContinueVote(game: Game) {
  const vote = game.continueVote;
  const voters = (vote?.playerIds ?? []).map(id => findPlayer(game, id)).filter((p): p is Player => !!p);
  const left = useCountdown(CONTINUE_COUNTDOWN_SEC, vote?.countdownAt, vote?.countdownAt !== undefined);
  return { voters, needed: continueVotesNeeded(game), left };
}

/** "Lea will", "Lea und Ben wollen", "Du willst", "Du und Lea wollt" … weitermachen. */
function votersSentence(voters: Player[], myId?: string): string {
  const mine = voters.some(p => p.id === myId);
  const names = [...(mine ? ["Du"] : []), ...voters.filter(p => p.id !== myId).map(p => p.name)];
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} und ${names.at(-1)}` : names[0];
  const verb = names.length === 1 ? (mine ? "willst" : "will") : mine ? "wollt" : "wollen";
  return `${list} ${verb} weitermachen`;
}

function VoterAvatars({ game, voters, size }: { game: Game; voters: Player[]; size: number }) {
  return (
    <span className="flex" aria-hidden>
      {voters.map(p => (
        <span key={p.id} className="-ml-1 rounded-full ring-2 ring-[var(--ring,var(--bg))] first:ml-0">
          <Avatar name={p.name} color={playerColor(game, p.id)} size={size} />
        </span>
      ))}
    </span>
  );
}

/**
 * The end of a revealed round. Whoever continues gets the button — on phones fixed at the bottom, so it can't
 * scroll out of sight — and sees who wants to move on; everyone else can vote to continue. Once a majority
 * of them does, the server continues on its own after a short countdown.
 */
export function ContinueBar({ game, controls, myId, label, onContinue, className = "" }: {
  game: Game;
  controls: GameControls;
  myId: string;
  label: string;
  onContinue: () => void;
  /** Extra classes for the desktop layout of the button. */
  className?: string;
}) {
  const continuing = continuingPlayer(game);
  const { voters, needed, left } = useContinueVote(game);
  const mine = continuing?.id === myId;
  const others = game.players.length > 1;

  // A short buzz when it's your turn to continue and whenever someone else wants to (Android; iPhones ignore it)
  const seen = useRef(voters.length);
  useEffect(() => {
    if (mine) navigator.vibrate?.(150);
  }, [mine]);
  useEffect(() => {
    if (mine && voters.length > seen.current) navigator.vibrate?.(60);
    seen.current = voters.length;
  }, [mine, voters.length]);

  if (!continuing) return null;
  if (!mine) return others ? <VoteCard game={game} controls={controls} myId={myId} continuing={continuing} /> : null;
  return (
    <>
      {/* Keeps the content clear of the fixed bar on phones */}
      <div className="h-28 shrink-0 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md flex-col gap-2.5 bg-bg px-5 pt-3 pb-6 shadow-[0_-16px_24px_var(--bg)] lg:static lg:mx-0 lg:max-w-none lg:bg-transparent lg:p-0 lg:shadow-none">
        {voters.length > 0 ? (
          <p className="flex items-center justify-center gap-2 lg:justify-start lg:text-lg" role="status">
            <VoterAvatars game={game} voters={voters} size={26} />
            <strong>{votersSentence(voters)}</strong>
            <span className="text-muted">· {voters.length}/{needed}</span>
          </p>
        ) : others && (
          <p className="flex items-center justify-center gap-2 font-bold text-primary lg:justify-start lg:text-lg" role="status">
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_25%,transparent)]" aria-hidden />
            Du bist dran – alle warten auf dich
          </p>
        )}
        <Button size="lg" block onClick={onContinue} className={`relative overflow-hidden ${className}`}>
          {left && <span className="absolute inset-y-0 left-0 bg-on-accent/15 transition-[width] duration-300" style={{ width: `${(1 - left.progress) * 100}%` }} aria-hidden />}
          <span className="relative inline-flex items-center gap-2">
            {label}{left && ` · in ${Math.max(1, left.seconds)} s`}<Kbd>Enter</Kbd>
          </span>
        </Button>
      </div>
    </>
  );
}

function VoteCard({ game, controls, myId, continuing }: { game: Game; controls: GameControls; myId: string; continuing: Player }) {
  const { voters, needed, left } = useContinueVote(game);
  // Viewers watch along but don't vote
  const mayVote = game.players.some(p => p.id === myId);
  const voted = voters.some(p => p.id === myId);
  const vote = () => controls.act({ type: "voteContinue", want: !voted });
  useHotkeys({ w: mayVote && vote });
  const missing = needed - voters.length;

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4 [--ring:var(--surface)] lg:w-[440px] lg:shrink-0">
      <div className="flex items-center gap-2.5">
        <Avatar name={continuing.name} color={playerColor(game, continuing.id)} size={32} />
        <span className="flex-1 text-muted"><strong className="text-text">{continuing.name}</strong> macht weiter</span>
        {voters.length > 0 && (
          <span className="flex items-center gap-1.5" role="img" aria-label={`${voters.length} von ${needed} wollen weitermachen`}>
            <VoterAvatars game={game} voters={voters} size={26} />
            <span className="text-sm font-bold">{voters.length}/{needed}</span>
          </span>
        )}
      </div>
      {left ? (
        <div role="status" className="flex items-center gap-3.5 rounded-2xl bg-primary px-3.5 py-3 text-on-accent">
          <span className="w-8 text-center font-display text-4xl leading-none font-extrabold">{Math.max(1, left.seconds)}</span>
          <span className="flex flex-col">
            <strong>Die Mehrheit will weitermachen</strong>
            <span className="text-sm">Geht gleich automatisch weiter</span>
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {voters.length > 0
            ? `${votersSentence(voters, myId)} – noch ${missing} ${missing === 1 ? "Stimme" : "Stimmen"}, dann geht's automatisch weiter`
            : "Will die Mehrheit weitermachen, geht's automatisch weiter"}
        </p>
      )}
      {mayVote && (
        <Button size="lg" block variant={voted ? "outline" : "buzz"} onClick={vote} aria-pressed={voted}>
          {voted ? "Doch nicht" : <><ChevronsRight size={22} strokeWidth={2.6} aria-hidden />Weiter geht&apos;s!</>}
          <Kbd>W</Kbd>
        </Button>
      )}
    </div>
  );
}

/** TV view after a revealed round: who continues, who wants to move on, and the countdown once a majority does. */
export function WaitingForNext({ game }: { game: Game }) {
  const next = continuingPlayer(game);
  const { voters, needed, left } = useContinueVote(game);
  if (!awaitingContinue(game) || !next) return null;
  return (
    <div className="mt-auto flex flex-wrap items-center gap-4 [--ring:var(--surface-2)]">
      {left ? (
        <span role="status" className="inline-flex h-18 shrink-0 items-center gap-3.5 rounded-full bg-primary pr-7 pl-2 text-on-accent">
          <CountdownRing seconds={Math.max(1, left.seconds)} progress={left.progress} />
          <span className="flex flex-col">
            <strong className="text-2xl leading-tight">Die Mehrheit will weitermachen</strong>
            <span className="text-lg leading-tight">Gleich geht&apos;s weiter</span>
          </span>
        </span>
      ) : (
        <span className="inline-flex h-18 shrink-0 items-center gap-3.5 rounded-full bg-surface pr-6 pl-3 text-2xl">
          <Avatar name={next.name} color={playerColor(game, next.id)} size={52} />
          <span>Warte auf <strong>{next.name}</strong> …</span>
        </span>
      )}
      {voters.map(p => (
        <span key={p.id} className="bubble-in inline-flex h-15 items-center gap-2.5 rounded-full bg-surface-2 pr-5 pl-2 text-xl">
          <Avatar name={p.name} color={playerColor(game, p.id)} size={44} />
          <span><strong>{p.name}</strong> will weitermachen</span>
        </span>
      ))}
      {voters.length > 0 && <span className="text-xl text-muted">{voters.length} von {needed}</span>}
    </div>
  );
}

function CountdownRing({ seconds, progress }: { seconds: number; progress: number }) {
  const circumference = 2 * Math.PI * 32;
  return (
    <span className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r="32" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="8" />
        <circle cx="38" cy="38" r="32" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-2xl font-extrabold">{seconds}</span>
    </span>
  );
}
