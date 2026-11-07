"use client";

import { yearData, type YearRound } from "@/lib/game/modes/year";
import type { ModeScreenProps } from "../types";
import { PlayerCards, SongCard, type CardInfo } from "../allplay";
import { NumberLine, SONG_QUESTION, SongResult, useGuessCountdown } from "./parts";

/** A player card: guessed or still thinking; after the reveal their guess, how far off and the points. */
function card(round: YearRound, playerId: string): CardInfo {
  const guess = round.guesses[playerId] as number | undefined;
  const result = round.result;
  if (!result) return playerId in round.guesses ? { note: "getippt" } : { note: "überlegt …", tone: "waiting" };
  const gain = result.points[playerId] ?? 0;
  if (guess === undefined) return { note: "kein Tipp", tone: "waiting" };
  const off = Math.abs(guess - result.song.year);
  const fastest = result.fastest === playerId ? " · am schnellsten" : "";
  return { note: (off === 0 ? `${guess} · exakt` : `${guess} · ${off} J.`) + fastest, gain, tone: off === 0 ? "right" : "plain" };
}

/** "Jahr schätzen" on the TV view: who has guessed, then everyone's guess on a number line and in the player cards. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = yearData(game);
  const round = data.round;
  const left = useGuessCountdown(data);
  if (!round) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <span className="text-2xl font-medium">Alle schätzen</span>
      <div className="flex flex-1 flex-col justify-center gap-6">
        {round.state === "guessing"
          ? <SongCard trackId={round.trackId} title={SONG_QUESTION} playback={playback} left={left} large />
          : round.result && <>
              <SongResult song={round.result.song} large />
              <NumberLine game={game} round={round} large />
            </>}
      </div>
      <PlayerCards game={game} info={id => card(round, id)} />
    </div>
  );
}
