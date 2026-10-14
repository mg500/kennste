"use client";

import { useState, useEffect } from "react";
import { MODES, type ModeId } from "@/lib/game/modes";
import type { Game } from "@/lib/game/types";
import type { PlaylistResult } from "@/lib/game/client";
import type { GameControls } from "@/lib/game/useGameSession";
import { getModeUI } from "./modes";
import { SettingRow, Stepper } from "./parts";

interface Props {
  game: Game;
  controls: GameControls;
  myId: string;
}

export function GameLobby({ game, controls, myId }: Props) {
  const { api, act, applyGame } = controls;
  const { id: gameId, players, settings, playlistTrackCount, viewers } = game;
  const isHost = game.hostPlayerId === myId;
  const onStart = isHost ? () => act({ type: "start" }) : undefined;

  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(isHost);
  const [lobbyOpen, setLobbyOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaylistResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/game/${gameId}`
    : `/game/${gameId}`;

  const { goal, maxRounds, targetScore, playerOrder, songSource } = settings;
  const modeUI = getModeUI(game.mode.id);

  const updateSetting = (patch: Partial<Game["settings"]>) => act({ type: "updateSettings", patch });

  useEffect(() => {
    const q = searchQuery.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!q) { setSearchResults([]); return; }
      setSearchLoading(true);
      try {
        const playlists = await api.searchPlaylists(q);
        if (!cancelled) setSearchResults(playlists);
      } finally {
        setSearchLoading(false);
      }
    }, q ? 400 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, api]);

  const loadPlaylist = async (playlistId: string) => {
    if (playlistLoading) return;
    setPlaylistLoading(true);
    setPlaylistError(null);
    const { game: updated, error } = await api.loadPlaylist(playlistId);
    if (updated) {
      applyGame(updated);
      setSearchQuery("");
      setSearchResults([]);
    } else {
      setPlaylistError(error ?? "Fehler beim Laden");
    }
    setPlaylistLoading(false);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xs">
      {onStart && <p className="text-gray-600 text-xs tracking-widest uppercase">Spiel erstellen</p>}
      {!onStart && <p className="text-gray-700 text-xs animate-pulse">Warte auf den Spielleiter…</p>}

      {/* Rules */}
      <div className="w-full">
        <button
          onClick={() => setRulesOpen(o => !o)}
          className="w-full flex items-center justify-between text-xs text-gray-700 hover:text-gray-500 transition px-1"
        >
          <span className="tracking-widest uppercase">Regeln</span>
          <span>{rulesOpen ? "−" : "+"}</span>
        </button>
        {rulesOpen && (
          <div className="mt-3 flex flex-col gap-2 text-xs text-gray-600 px-1">
            <modeUI.Rules />
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="w-full flex flex-col gap-3">
        <button
          onClick={() => setSettingsOpen(o => !o)}
          className="w-full flex items-center justify-between text-xs text-gray-600 hover:text-gray-400 transition px-1"
        >
          <span className="tracking-widest uppercase">Einstellungen</span>
          <span>{settingsOpen ? "−" : "+"}</span>
        </button>
      </div>
      <div className={`w-full flex flex-col gap-5 ${!onStart ? "pointer-events-none opacity-40" : ""} ${settingsOpen ? "" : "hidden"}`}>

        <div className="w-full flex flex-col gap-2.5">
          <SettingRow label="Songquelle">
            <div className="flex items-center gap-1">
              {(["players", "playlist"] as const).map(s => (
                <button key={s} onClick={() => updateSetting({ songSource: s })}
                  className={`text-xs px-2.5 py-1 rounded transition ${songSource === s ? "bg-gray-700 text-white" : "text-gray-600 hover:text-gray-400"}`}>
                  {s === "players" ? "Spieler" : "Playlist"}
                </button>
              ))}
            </div>
          </SettingRow>
          {songSource === "playlist" && (
            <div className="flex flex-col gap-1.5">
              {playlistTrackCount !== undefined && playlistTrackCount > 0 ? (
                <p className="text-xs text-green-600">{playlistTrackCount} Songs geladen</p>
              ) : (
                <p className="text-xs text-gray-700">Noch keine Playlist geladen</p>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPlaylistError(null); }}
                  placeholder="Playlist suchen…"
                  className="bg-transparent border-b border-gray-800 focus:border-gray-500 px-1 py-1 text-white placeholder-gray-700 focus:outline-none flex-1 transition-colors text-xs"
                />
                {(searchLoading || playlistLoading) && <span className="text-xs text-gray-600 shrink-0">…</span>}
              </div>
              {searchResults.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {searchResults.map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => loadPlaylist(pl.id)}
                      disabled={playlistLoading}
                      className="flex items-center gap-2 text-left px-1 py-1.5 rounded hover:bg-gray-900 transition disabled:opacity-50"
                    >
                      {pl.image
                        ? <img src={pl.image} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                        : <div className="w-7 h-7 rounded bg-gray-800 shrink-0" />}
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs text-white truncate">{pl.name}</span>
                        <span className="text-xs text-gray-600 truncate">{pl.owner} · {pl.trackCount} Songs</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {playlistError && <p className="text-xs text-red-600">{playlistError}</p>}
            </div>
          )}
          <SettingRow label="Spielmodus">
            <div className="flex items-center gap-1">
              {(Object.keys(MODES) as ModeId[]).map(m => (
                <button key={m} onClick={() => act({ type: "setMode", mode: m })}
                  className={`text-xs px-2.5 py-1 rounded transition ${game.mode.id === m ? "bg-gray-700 text-white" : "text-gray-600 hover:text-gray-400"}`}>
                  {MODES[m].name}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Ziel">
            <div className="flex items-center gap-1">
              {(["rounds", "score"] as const).map(g => (
                <button key={g} onClick={() => updateSetting({ goal: g })}
                  className={`text-xs px-2.5 py-1 rounded transition ${goal === g ? "bg-gray-700 text-white" : "text-gray-600 hover:text-gray-400"}`}>
                  {g === "rounds" ? "Runden" : "Punkte"}
                </button>
              ))}
            </div>
          </SettingRow>
          {goal === "rounds" ? (
            <SettingRow label="Runden">
              <Stepper value={maxRounds}
                onDec={() => updateSetting({ maxRounds: Math.max(1, maxRounds - 1) })}
                onInc={() => updateSetting({ maxRounds: Math.min(20, maxRounds + 1) })}
                disableDec={maxRounds <= 1} disableInc={maxRounds >= 20} />
            </SettingRow>
          ) : (
            <SettingRow label="Punkte zum Sieg">
              <Stepper value={targetScore}
                onDec={() => updateSetting({ targetScore: Math.max(1, targetScore - 1) })}
                onInc={() => updateSetting({ targetScore: Math.min(20, targetScore + 1) })}
                disableDec={targetScore <= 1} disableInc={targetScore >= 20} />
            </SettingRow>
          )}
          <SettingRow label="Reihenfolge">
            <div className="flex gap-1">
              {(["sequential", "random"] as const).map(o => (
                <button key={o} onClick={() => updateSetting({ playerOrder: o })}
                  className={`text-xs px-2.5 py-1 rounded transition ${playerOrder === o ? "bg-gray-700 text-white" : "text-gray-600 hover:text-gray-400"}`}>
                  {o === "sequential" ? "reihum" : "zufällig"}
                </button>
              ))}
            </div>
          </SettingRow>
        </div>

        <div className="w-full flex flex-col gap-2.5 border-t border-gray-900 pt-4">
          <modeUI.Settings game={game} controls={controls} />
        </div>

      </div>

      {/* Lobby */}
      <div className="w-full flex flex-col gap-3 border-t border-gray-800 pt-5">
        <button
          onClick={() => setLobbyOpen(o => !o)}
          className="w-full flex items-center justify-between text-xs text-gray-600 hover:text-gray-400 transition px-1"
        >
          <span className="tracking-widest uppercase">Lobby</span>
          <span>{lobbyOpen ? "−" : "+"}</span>
        </button>
        {lobbyOpen && (
          <>
            <div className="w-full flex flex-col gap-1">
              {players.map(p => {
                const isViewer = viewers.includes(p.id);
                return (
                  <div key={p.id} className={`text-sm py-2 px-3 rounded-lg flex justify-between items-center ${p.id === myId ? "bg-gray-900" : ""}`}>
                    <span className={p.id === myId ? "text-white" : "text-gray-500"}>{p.name}</span>
                    <div className="flex items-center gap-2">
                      {isViewer && <span className="text-gray-700 text-xs">zuschauer</span>}
                      {p.id === myId && !isViewer && <span className="text-gray-700 text-xs">du</span>}
                      {onStart && p.id !== myId && (
                        <>
                          <button
                            onClick={() => act({ type: "toggleViewer", playerId: p.id })}
                            className={`text-xs transition ${isViewer ? "text-gray-500 hover:text-gray-300" : "text-gray-700 hover:text-gray-400"}`}
                            title={isViewer ? "Als Spieler einsetzen" : "Als Zuschauer einsetzen"}
                          >
                            {isViewer ? "spieler" : "zuschauer"}
                          </button>
                          <button
                            onClick={() => act({ type: "kick", playerId: p.id })}
                            className="text-gray-700 hover:text-red-500 transition text-xs"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => {
                if (navigator.share) navigator.share({ url: shareUrl });
                else navigator.clipboard.writeText(shareUrl);
              }}
              className="text-sm text-gray-600 hover:text-gray-300 border border-gray-800 hover:border-gray-600 rounded-lg px-3 py-2 transition flex items-center gap-2 self-start"
            >
              Link teilen
              <span className="text-gray-700 font-mono">{gameId}</span>
            </button>
          </>
        )}
      </div>

      {/* Start */}
      {onStart && (
        <button
          onClick={onStart}
          className="w-full py-3 rounded-xl border border-gray-700 hover:border-gray-500 text-white/80 hover:text-white text-sm font-light transition"
        >
          Starten
        </button>
      )}

    </div>
  );
}
