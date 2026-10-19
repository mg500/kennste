"use client";

import { choiceData, type ChoiceRound } from "@/lib/game/modes/choice";
import { findPlayer } from "../../shared";
import { PlayerCards, SongCard, type CardInfo } from "../allplay";
import type { ModeScreenProps } from "../types";
import { Options, question, SongResult, useAnswerCountdown } from "./parts";

const seconds = (round: ChoiceRound, at: number) =>
  round.playingAt ? ` · ${((at - round.playingAt) / 1000).toFixed(1).replace(".", ",")} s` : "";

/** A player card: answered or still thinking; after the reveal their answer, how fast and the points. */
function card(round: ChoiceRound, playerId: string): CardInfo {
  const answer = round.answers[playerId];
  const result = round.result;
  if (!result) return answer ? { note: "getippt" } : { note: "überlegt …", tone: "waiting" };
  if (!answer) return { note: "keine Antwort", tone: "waiting" };
  const gain = result.points[playerId] ?? 0;
  return { note: `Antwort ${answer.option + 1}${seconds(round, answer.at)}`, gain, tone: result.fastest === playerId ? "right" : "plain" };
}

/** Song-Tipp on the TV view: the question and options, then the right answer, everyone's picks, times and points. */
export function BigScreen({ game, playback }: ModeScreenProps) {
  const data = choiceData(game);
  const round = data.round;
  const left = useAnswerCountdown(data);
  if (!round) return null;
  const fastest = findPlayer(game, round.result?.fastest);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <span className="text-2xl font-medium">Alle raten</span>
      <div className="flex flex-1 flex-col justify-center gap-5">
        {round.state === "answering"
          ? <SongCard trackId={round.trackId} {...question(round)} playback={playback} left={left} large />
          : <div className="flex flex-col gap-3">
              <SongResult round={round} large />
              {fastest && <span className="text-2xl text-muted">{fastest.name} war am schnellsten</span>}
            </div>}
        <Options game={game} round={round} large />
      </div>
      <PlayerCards game={game} info={id => card(round, id)} />
    </div>
  );
}
