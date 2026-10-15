"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Flame, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/hotkeys";
import { Avatar } from "@/components/ui/primitives";
import { awaitingContinue, continuingPlayer } from "@/lib/game/reducer";
import { REACTION_KINDS, type Game, type Reaction, type ReactionKind } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { findPlayer, playerColor } from "./shared";

/** Reactions that arrived in the last few seconds (provided by the game page and the TV view). */
export const ReactionsContext = createContext<Reaction[]>([]);

const REACTION_LABELS: Record<ReactionKind, string> = { skip: "Song skippen", fire: "Feier ich" };
const REACTION_BG: Record<ReactionKind, string> = { skip: "var(--buzz)", fire: "var(--p5)" };
/** Matches the server's rate limit. */
const REACTION_COOLDOWN_MS = 2500;

function ReactionIcon({ kind, size }: { kind: ReactionKind; size: number }) {
  const Icon = kind === "skip" ? SkipForward : Flame;
  return <Icon size={size} strokeWidth={2.6} aria-hidden fill={kind === "skip" ? "currentColor" : "none"} />;
}

/** Speech bubbles "avatar + icon" for the latest reactions. */
export function ReactionBubbles({ game, large, className = "" }: { game: Game; large?: boolean; className?: string }) {
  const reactions = useContext(ReactionsContext);
  if (reactions.length === 0) return null;
  return (
    <div aria-live="polite" className={`flex gap-2 ${className}`}>
      {reactions.slice(-4).map(r => {
        const player = findPlayer(game, r.playerId);
        if (!player) return null;
        return (
          <div key={r.id} className={`bubble-in relative flex items-center gap-2 rounded-full bg-surface-2 py-1.5 pr-3 pl-1.5 shadow-xl ${large ? "gap-2.5 py-2 pr-4 pl-2" : ""}`}>
            <Avatar name={player.name} color={playerColor(game, player.id)} size={large ? 44 : 32} />
            <span role="img" aria-label={`${player.name}: ${REACTION_LABELS[r.kind]}`}
              className={`inline-flex items-center justify-center rounded-full text-on-accent ${large ? "h-10 w-10" : "h-7 w-7"}`}
              style={{ background: REACTION_BG[r.kind] }}>
              <ReactionIcon kind={r.kind} size={large ? 22 : 15} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The end of a revealed round. Whoever continues gets the button — on phones fixed at the bottom, so it can't
 * scroll out of sight — with "Du bist dran" and the others' reactions; everyone else can nudge them.
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
  const reactions = useContext(ReactionsContext);
  const mine = continuing?.id === myId;
  const others = game.players.length > 1;

  // A short buzz when it's your turn to continue and on every reaction (Android; iPhones ignore it)
  const seen = useRef(reactions.length);
  useEffect(() => {
    if (mine) navigator.vibrate?.(150);
  }, [mine]);
  useEffect(() => {
    if (mine && reactions.length > seen.current) navigator.vibrate?.(60);
    seen.current = reactions.length;
  }, [mine, reactions.length]);

  if (!continuing) return null;
  if (!mine) return <Nudge game={game} controls={controls} continuingId={continuing.id} />;
  return (
    <>
      {/* Keeps the content clear of the fixed bar on phones */}
      <div className="h-28 shrink-0 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md flex-col gap-2.5 bg-bg px-5 pt-3 pb-6 shadow-[0_-16px_24px_var(--bg)] lg:static lg:mx-0 lg:max-w-none lg:bg-transparent lg:p-0 lg:shadow-none">
        <ReactionBubbles game={game} className="absolute right-5 bottom-full flex-col items-end pb-2 lg:hidden" />
        {others && (
          <p className="flex items-center justify-center gap-2 font-bold text-primary lg:justify-start lg:text-lg" role="status">
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_25%,transparent)]" aria-hidden />
            Du bist dran – alle warten auf dich
          </p>
        )}
        <Button size="lg" block onClick={onContinue} className={className}>{label}<Kbd>Enter</Kbd></Button>
        <ReactionBubbles game={game} className="hidden flex-wrap lg:flex" />
      </div>
    </>
  );
}

function Nudge({ game, controls, continuingId }: { game: Game; controls: GameControls; continuingId: string }) {
  const [sent, setSent] = useState<ReactionKind | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const continuing = findPlayer(game, continuingId);

  const send = async (kind: ReactionKind) => {
    setSent(kind);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSent(null), REACTION_COOLDOWN_MS);
    await controls.api.react(kind);
  };

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4 lg:w-[440px] lg:shrink-0">
      <div className="flex items-center gap-2.5">
        {continuing && <Avatar name={continuing.name} color={playerColor(game, continuing.id)} size={32} />}
        <span className="flex-1 text-muted"><strong className="text-text">{continuing?.name}</strong> macht weiter</span>
        {sent && <span className="text-sm font-bold text-positive" role="status">Angestupst</span>}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {REACTION_KINDS.map(kind => (
          <button key={kind} onClick={() => send(kind)} disabled={!!sent} aria-label={REACTION_LABELS[kind]} title={REACTION_LABELS[kind]}
            className={`inline-flex h-14 items-center justify-center rounded-2xl border-2 transition disabled:cursor-default ${sent && sent !== kind ? "opacity-45" : ""}`}
            style={sent === kind
              ? { background: REACTION_BG[kind], borderColor: REACTION_BG[kind], color: "var(--on-accent)" }
              : { background: "var(--bg)", borderColor: "var(--surface-2)", color: REACTION_BG[kind] }}>
            <ReactionIcon kind={kind} size={24} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** TV view after a revealed round: who continues, and the others' reactions as speech bubbles. */
export function WaitingForNext({ game }: { game: Game }) {
  const next = continuingPlayer(game);
  if (!awaitingContinue(game) || !next) return null;
  return (
    <div className="mt-auto flex flex-wrap items-end gap-4">
      <span className="inline-flex h-18 shrink-0 items-center gap-3.5 rounded-full bg-surface pr-6 pl-3 text-2xl">
        <Avatar name={next.name} color={playerColor(game, next.id)} size={52} />
        <span>Warte auf <strong>{next.name}</strong> …</span>
      </span>
      <ReactionBubbles game={game} large className="flex-wrap pb-1" />
    </div>
  );
}
