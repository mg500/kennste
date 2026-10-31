"use client";

import { Music } from "lucide-react";
import { Avatar, ProgressBar } from "@/components/ui/primitives";
import { QrCode } from "@/components/ui/QrCode";
import { groupOf, variantOf } from "@/lib/game/modes/groups";
import { getModeUI, GROUP_COLORS } from "./modes";
import { ruleChips } from "./LobbyGame";
import type { Game } from "@/lib/game/types";
import { usePlaybackProgress, type ReceivedPlayback } from "@/lib/game/useGameSession";
import { playerColor } from "./shared";
import { Logo } from "@/components/ui/Logo";

function joinUrl(gameId: string) {
  return typeof window === "undefined" ? `/game/${gameId}` : `${window.location.origin}/game/${gameId}`;
}

/** TV view in the lobby: how to join, who is in, what plays — or, switched by the host, only what plays. */
export function ScreenLobby({ game, playback }: { game: Game; playback: ReceivedPlayback | null }) {
  const track = playback?.data.track;
  if (track && game.screenView === "nowPlaying") return <NowPlaying game={game} playback={playback} />;
  return (
    <div className="flex flex-1 gap-14">
      <div className="flex flex-1 flex-col justify-center gap-8">
        <Logo size="lg" />
        <ModeTitle game={game} />
        <div className="flex flex-wrap gap-3">
          {game.players.map(p => (
            <span key={p.id} className="inline-flex h-16 items-center gap-3 rounded-full bg-surface pr-6 pl-2 text-2xl font-medium">
              <Avatar name={p.name} color={playerColor(game, p.id)} size={48} />{p.name}
            </span>
          ))}
        </div>
        {track && <NowPlayingCard playback={playback} />}
      </div>
      <div className="flex flex-col items-center justify-center gap-5">
        <QrCode value={joinUrl(game.id)} size={320} />
        <span className="font-display text-6xl font-extrabold uppercase tracking-[0.12em]">{game.id}</span>
        <span className="text-xl text-muted">Scannen oder Code eingeben</span>
      </div>
    </div>
  );
}

/** "Gleich spielen wir": the mode with its variant, what makes it different and the rules – the same for everyone in the room. */
function ModeTitle({ game }: { game: Game }) {
  const group = groupOf(game.mode.id);
  const variant = variantOf(game.mode);
  const ui = getModeUI(group.variants[0].mode);
  return (
    <div className="flex flex-col gap-4.5">
      <span className="text-2xl font-medium text-muted">Gleich spielen wir</span>
      <div className="flex items-center gap-6">
        <span aria-hidden className={`inline-flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] text-on-accent ${GROUP_COLORS[group.id].bg}`}>
          <ui.icon size={46} />
        </span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="font-display text-7xl leading-[0.95] font-extrabold">{group.name}</span>
          {group.variants.length > 1 && <span className={`text-[32px] font-bold ${GROUP_COLORS[group.id].text}`}>{variant.label}</span>}
        </span>
      </div>
      <p className="max-w-205 text-[26px] leading-snug text-muted">{variant.description}</p>
      <div className="flex flex-wrap gap-2.5">
        {ruleChips(game).map(c => <span key={c} className="inline-flex h-11 items-center rounded-full bg-surface px-4.5 text-[19px] font-bold">{c}</span>)}
      </div>
    </div>
  );
}

function Cover({ src, size, className = "" }: { src: string | null; size: number; className?: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" className={`shrink-0 object-cover ${className}`} style={{ width: size, height: size }} />
    : <span className={`inline-flex shrink-0 items-center justify-center bg-surface-2 ${className}`} style={{ width: size, height: size }}><Music size={size / 3} aria-hidden /></span>;
}

/** What the host's music plays in the lobby. */
function NowPlayingCard({ playback }: { playback: ReceivedPlayback | null }) {
  const track = playback?.data.track;
  const progress = usePlaybackProgress(playback, playback?.data.trackId ?? undefined);
  if (!track) return null;
  return (
    <div className="flex max-w-2xl items-center gap-5 rounded-[28px] bg-surface py-4 pr-6 pl-4">
      <Cover src={track.albumArt} size={96} className="rounded-[18px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-2 font-bold text-positive-text"><Music size={18} aria-hidden />{playback.data.isPlaying ? "Läuft gerade" : "Pausiert"}</span>
        <span className="truncate text-3xl font-bold">{track.name}</span>
        <span className="truncate text-xl text-muted">{track.artist}</span>
        {progress && <div className="mt-1"><ProgressBar {...progress} /></div>}
      </div>
    </div>
  );
}

/** The host switched the TV to what's playing: like Just Playing, with a small way to join. */
function NowPlaying({ game, playback }: { game: Game; playback: ReceivedPlayback | null }) {
  const track = playback?.data.track;
  const progress = usePlaybackProgress(playback, playback?.data.trackId ?? undefined);
  if (!track) return null;
  return (
    <div className="flex flex-1 items-center gap-18 px-8">
      <Cover src={track.albumArt} size={520} className="rounded-[40px] shadow-2xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <span className="flex items-center gap-3 text-2xl font-bold text-positive-text"><Music size={26} aria-hidden />{playback.data.isPlaying ? "Läuft gerade" : "Pausiert"}</span>
        <h1 className="font-display text-[104px] leading-[0.92] font-extrabold tracking-tight">{track.name}</h1>
        <span className="text-4xl text-muted">{track.artist}{track.releaseYear && ` · ${track.releaseYear}`}</span>
        {progress && <div className="mt-3"><ProgressBar {...progress} thick /></div>}
      </div>
      <div className="absolute right-0 bottom-0 flex items-center gap-4 rounded-[22px] bg-surface py-3 pr-5 pl-3">
        <QrCode value={joinUrl(game.id)} size={84} />
        <div className="flex flex-col gap-1">
          <span className="text-muted">Mitspielen · {game.players.length} dabei</span>
          <span className="font-display text-3xl font-extrabold uppercase tracking-[0.1em]">{game.id}</span>
        </div>
      </div>
    </div>
  );
}
