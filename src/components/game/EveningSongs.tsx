"use client";

import { useState } from "react";
import { Check, ListMusic } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { Cover, SongList } from "./End";
import { findPlayer } from "./shared";

const COVERS = 5;

/**
 * The lobby's card with every song played tonight (all games in this lobby). The host saves them as one Spotify
 * playlist and later adds the songs of further games to it; the others get the link.
 */
export function EveningSongs({ game, myId, controls, inline }: {
  game: Game; myId?: string; controls?: GameControls;
  /** On laptops, the songs as a list right in the card (the evening's summary) instead of behind "Alle ansehen". */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const evening = game.evening;
  if (!evening?.songs.length) return null;
  const { songs } = evening;
  const games = evening.games.length;
  const isHost = !!controls && game.hostPlayerId === myId;
  const host = findPlayer(game, game.hostPlayerId);
  return (
    <section aria-labelledby="evening-heading" className={`flex flex-col gap-3 rounded-card bg-surface p-4 lg:rounded-[28px] lg:px-6 lg:py-5.5 ${inline ? "lg:self-start" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="evening-heading" className="font-bold lg:text-lg">Songs des Abends</h2>
        <span className="text-sm text-muted">{games} {games === 1 ? "Spiel" : "Spiele"} · {songs.length} Songs</span>
      </div>
      {inline && <div className="hidden max-h-[56dvh] overflow-y-auto lg:block"><SongList game={game} songs={songs.map(song => ({ song }))} /></div>}
      <button onClick={() => setOpen(true)} aria-label={`Alle ${songs.length} Songs ansehen`} className={`flex items-center self-start ${inline ? "lg:hidden" : ""}`}>
        {songs.slice(0, COVERS).map(s => (
          <Cover key={s.trackId} src={s.albumArt} className="-mr-2.5 h-11.5 w-11.5 rounded-[10px] border-3 border-surface" />
        ))}
        <span className="ml-4.5 font-bold whitespace-nowrap text-muted">Alle ansehen</span>
      </button>
      {isHost ? <SaveEvening game={game} controls={controls!} />
        : game.savedPlaylist ? (
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Check size={16} strokeWidth={3} className="text-positive" aria-hidden />{host?.name ?? "Der Host"} hat sie als Playlist gespeichert
            </span>
            <a href={game.savedPlaylist.url} target="_blank" rel="noreferrer"
              className="inline-flex h-13 items-center justify-center rounded-2xl bg-surface-2 font-bold">In Spotify öffnen</a>
          </div>
        ) : <p className="text-sm text-muted">{host?.name ?? "Der Host"} kann sie {game.closedAt ? "noch " : ""}als Spotify-Playlist speichern – der Link erscheint dann hier.</p>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Songs des Abends">
        <SongList game={game} songs={songs.map(song => ({ song }))} />
        <Button size="lg" block onClick={() => setOpen(false)}>Fertig</Button>
      </Sheet>
    </section>
  );
}

/** Host: saves the evening's songs as a playlist, once; songs of later games go into the same one. */
function SaveEvening({ game, controls }: { game: Game; controls: GameControls }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const saved = game.savedPlaylist;
  const added = (game.evening?.songs.length ?? 0) - (saved?.songs ?? 0);
  const save = async () => {
    setBusy(true);
    setError(undefined);
    const result = await controls.api.savePlaylist();
    setBusy(false);
    if (result.error) setError(result.error);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {saved ? (
        <div className="flex gap-2">
          <a href={saved.url} target="_blank" rel="noreferrer"
            className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-2 font-bold">
            <Check size={18} strokeWidth={3} className="text-positive" aria-hidden />In Spotify öffnen
          </a>
          {added > 0 && (
            <Button variant="outline" onClick={save} disabled={busy} className="h-13 flex-1 border-primary text-primary">
              {busy ? "Wird hinzugefügt …" : `+${added} ${added === 1 ? "neuer" : "neue"} hinzufügen`}
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" onClick={save} disabled={busy} className="h-13">
          <ListMusic size={20} aria-hidden />{busy ? "Wird gespeichert …" : "Als Spotify-Playlist speichern"}
        </Button>
      )}
      {saved && <span className="text-[13px] text-muted">Privat in deinem Spotify</span>}
      {error && <p role="alert" className="text-center text-sm text-buzz">{error}</p>}
    </div>
  );
}
