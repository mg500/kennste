"use client";

import { useEffect, useRef, useState } from "react";
import type { GuessedSong } from "@/lib/game/modes/buzzer";
import type { CoreSettings, Player } from "@/lib/game/types";
import { DEFAULT_ACCENT } from "./parts";

const POPUP_DELAY_MS = 1000;
const POPUP_MS = 1200;

interface Popup { id: string; delta: number; key: number }

/** Delays score increases so a "+1" popup can play before the number changes. */
function useAnimatedScores(players: Player[], scores: Record<string, number>, enabled: boolean) {
  const [displayed, setDisplayed] = useState(scores);
  const [popups, setPopups] = useState<Popup[]>([]);
  const displayedRef = useRef(displayed);
  const keyRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const gained = players.flatMap(p => {
      const delta = (scores[p.id] ?? 0) - (displayedRef.current[p.id] ?? 0);
      return delta > 0 ? [{ id: p.id, delta, key: keyRef.current++ }] : [];
    });
    const commit = () => { displayedRef.current = scores; setDisplayed(scores); setPopups([]); };
    if (gained.length === 0) {
      const t = setTimeout(commit, 0);
      return () => clearTimeout(t);
    }
    const show = setTimeout(() => setPopups(gained), POPUP_DELAY_MS);
    const done = setTimeout(commit, POPUP_DELAY_MS + POPUP_MS);
    return () => { clearTimeout(show); clearTimeout(done); };
  }, [scores, players, enabled]);

  return enabled ? { displayed, popups } : { displayed: scores, popups: [] };
}

export function Scoreboard({
  players, scores, myId, currentPlayerId, skippedPlayers = [], wrongPlayers = [], guessedSongs = {},
  accentColor = DEFAULT_ACCENT, expandAll = false, animate = false, currentRound, settings,
}: {
  players: Player[];
  scores: Record<string, number>;
  myId: string;
  currentPlayerId?: string;
  skippedPlayers?: string[];
  wrongPlayers?: string[];
  guessedSongs?: Record<string, GuessedSong[]>;
  accentColor?: string;
  expandAll?: boolean;
  animate?: boolean;
  currentRound?: number;
  settings: CoreSettings;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(myId);
  const { displayed, popups } = useAnimatedScores(players, scores, animate);
  const sorted = [...players].sort((a, b) => (displayed[b.id] ?? 0) - (displayed[a.id] ?? 0));

  return (
    <div className="w-full flex flex-col gap-1">
      <div className="border-t mt-6 pt-5" style={{ borderColor: accentColor + "40" }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-gray-600 text-xs tracking-widest uppercase">Punktestand</p>
          {settings.goal === "score"
            ? <p className="text-gray-700 text-xs">Bis {settings.targetScore} Punkte</p>
            : currentRound !== undefined && (
              <p className="text-gray-700 text-xs">Runde {currentRound} / {settings.maxRounds}</p>
            )}
        </div>
        {sorted.map(p => {
          const songs = guessedSongs[p.id] ?? [];
          const isExpanded = expandAll || expandedId === p.id;
          return (
            <div key={p.id}>
              <button
                onClick={() => !expandAll && setExpandedId(isExpanded ? null : p.id)}
                className={`relative flex justify-between items-center px-3 py-2 rounded-lg text-sm w-full text-left ${p.id === myId ? "bg-gray-900" : ""}`}
              >
                <span className={`flex items-center gap-2 ${p.id === currentPlayerId ? "text-white" : "text-gray-500"}`}>
                  <span className={`text-xs leading-none ${p.id === currentPlayerId ? "text-green-500" : "text-white/20"}`}>▶</span>
                  {p.name}
                  {p.id === myId && <span className="text-gray-700 text-xs">du</span>}
                  {skippedPlayers.includes(p.id) && <span className="text-gray-700 text-xs">übersprungen</span>}
                  {wrongPlayers.includes(p.id) && <span className="text-red-900 text-xs">falsch</span>}
                </span>
                <span className="relative text-gray-400 tabular-nums">
                  {displayed[p.id] ?? 0}
                  {popups.filter(x => x.id === p.id).map(x => (
                    <span key={x.key} className="score-pop absolute -top-1 right-0 text-green-400 text-xs font-bold pointer-events-none whitespace-nowrap">
                      +{x.delta}
                    </span>
                  ))}
                </span>
              </button>
              {isExpanded && (
                <div className="flex flex-col gap-1 px-3 pb-2">
                  {songs.length === 0
                    ? <p className="text-gray-700 text-xs">Noch keine Songs erraten</p>
                    : songs.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {s.albumArt && <img src={s.albumArt} alt="" className="w-6 h-6 rounded" />}
                        <div>
                          <p className="text-xs text-white">{s.songName}</p>
                          <p className="text-xs text-gray-600">{s.artistName}</p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
