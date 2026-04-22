"use client";

import { useState } from "react";
import { GameData, Player } from "./types";

interface Props {
  players: Player[];
  myId: string;
  gameId: string;
  settings?: GameData["settings"];
  onStart?: () => void;
  onGameData?: (data: GameData) => void;
}

export function GameLobby({ players, myId, gameId, settings, onStart, onGameData }: Props) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/game/${gameId}`
    : `/game/${gameId}`;

  const gameMode = settings?.gameMode ?? "rounds";
  const maxRounds = settings?.maxRounds ?? 5;
  const bestOf = settings?.bestOf ?? 3;
  const playerOrder = settings?.playerOrder ?? "sequential";
  const maxBuzzes = settings?.maxBuzzesPerRound ?? 1;
  const buzzTimeLimit = settings?.buzzTimeLimit ?? 10;
  const playTimeLimit = settings?.playTimeLimit ?? 30;
  const hintsEnabled = settings?.hintsEnabled ?? { cover: true, title: true, artist: true, year: true };

  const updateSetting = async (patch: object) => {
    const res = await fetch(`/api/game/${gameId}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok && onGameData) onGameData(await res.json());
  };

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-xs">
      {onStart && <p className="text-gray-600 text-xs tracking-widest uppercase">Erstelle ein Spiel</p>}
      {!onStart && <p className="text-gray-700 text-xs animate-pulse">Warte auf den Spielleiter…</p>}
      <div className={`w-full flex flex-col gap-3 ${!onStart ? "pointer-events-none opacity-40" : ""}`}>
          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-gray-600">Modus</span>
            <div className="flex gap-1">
              {(["rounds", "bestOf"] as const).map(m => (
                <button key={m} onClick={() => updateSetting({ gameMode: m })}
                  className={`text-xs px-2.5 py-1 rounded transition ${gameMode === m ? "bg-gray-700 text-white" : "text-gray-600 hover:text-gray-400"}`}>
                  {m === "rounds" ? "Runden" : "Best of"}
                </button>
              ))}
            </div>
          </div>

          {gameMode === "rounds" ? (
          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-gray-600">Runden</span>
            <div className="flex items-center gap-3">
              <button onClick={() => updateSetting({ maxRounds: Math.min(20, Math.max(1, maxRounds - 1)) })} disabled={maxRounds <= 1}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">−</button>
              <span className="text-white text-sm w-4 text-center">{maxRounds}</span>
              <button onClick={() => updateSetting({ maxRounds: Math.min(20, Math.max(1, maxRounds + 1)) })} disabled={maxRounds >= 20}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">+</button>
            </div>
          </div>
          ) : (
          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-gray-600">Punkte zum Sieg</span>
            <div className="flex items-center gap-3">
              <button onClick={() => updateSetting({ bestOf: Math.max(1, bestOf - 1) })} disabled={bestOf <= 1}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">−</button>
              <span className="text-white text-sm w-4 text-center">{bestOf}</span>
              <button onClick={() => updateSetting({ bestOf: Math.min(20, bestOf + 1) })} disabled={bestOf >= 20}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">+</button>
            </div>
          </div>
          )}

          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-gray-600">Reihenfolge</span>
            <div className="flex gap-1">
              {(["sequential", "random"] as const).map(o => (
                <button key={o} onClick={() => updateSetting({ playerOrder: o })}
                  className={`text-xs px-2.5 py-1 rounded transition ${playerOrder === o ? "bg-gray-700 text-white" : "text-gray-600 hover:text-gray-400"}`}>
                  {o === "sequential" ? "reihum" : "zufällig"}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-gray-600">Tipps</span>
            <div className="flex gap-1.5">
              {(["cover", "title", "artist", "year"] as const).map(field => {
                const label = { cover: "Cover", title: "Titel", artist: "Interpret", year: "Jahr" }[field];
                const on = hintsEnabled[field];
                return (
                  <button key={field}
                    onClick={() => updateSetting({ hintsEnabled: { ...hintsEnabled, [field]: !on } })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${on ? "border-gray-600 text-gray-300" : "border-gray-800 text-gray-700 line-through"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-gray-600">Buzzer / Runde</span>
            <div className="flex items-center gap-3">
              <button onClick={() => updateSetting({ maxBuzzesPerRound: Math.max(1, maxBuzzes - 1) })} disabled={maxBuzzes <= 1}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">−</button>
              <span className="text-white text-sm w-4 text-center">{maxBuzzes}</span>
              <button onClick={() => updateSetting({ maxBuzzesPerRound: Math.min(5, maxBuzzes + 1) })} disabled={maxBuzzes >= 5}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">+</button>
            </div>
          </div>

          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-gray-600">Zeitlimit zum Auflösen</span>
            <div className="flex items-center gap-3">
              <button onClick={() => updateSetting({ playTimeLimit: Math.max(0, playTimeLimit - 5) })} disabled={playTimeLimit <= 0}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">−</button>
              <span className="text-white text-sm w-8 text-center">{playTimeLimit === 0 ? "∞" : `${playTimeLimit}s`}</span>
              <button onClick={() => updateSetting({ playTimeLimit: Math.min(300, playTimeLimit + 5) })} disabled={playTimeLimit >= 300}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">+</button>
            </div>
          </div>

          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-gray-600">Zeitlimit zum Antworten</span>
            <div className="flex items-center gap-3">
              <button onClick={() => updateSetting({ buzzTimeLimit: Math.max(0, buzzTimeLimit - 5) })} disabled={buzzTimeLimit <= 0}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">−</button>
              <span className="text-white text-sm w-8 text-center">{buzzTimeLimit === 0 ? "∞" : `${buzzTimeLimit}s`}</span>
              <button onClick={() => updateSetting({ buzzTimeLimit: Math.min(120, buzzTimeLimit + 5) })} disabled={buzzTimeLimit >= 120}
                className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">+</button>
            </div>
          </div>
        </div>

      {onStart && (
        <button
          onClick={onStart}
          className="text-sm font-light text-white/80 hover:text-white border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition"
        >
          Starten
        </button>
      )}

      <p className="text-gray-600 text-xs tracking-widest uppercase">Lobby</p>
      <div className="w-full flex flex-col gap-1">
        {players.map(p => (
          <div key={p.id} className={`text-sm py-2 px-3 rounded-lg flex justify-between items-center ${p.id === myId ? "bg-gray-900" : ""}`}>
            <span className={p.id === myId ? "text-white" : "text-gray-500"}>{p.name}</span>
            {p.id === myId && <span className="text-gray-700 text-xs">du</span>}
            {onStart && p.id !== myId && (
              <button
                onClick={async () => {
                  const res = await fetch(`/api/game/${gameId}/kick`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ playerId: p.id }),
                  });
                  if (res.ok && onGameData) onGameData(await res.json());
                }}
                className="text-gray-700 hover:text-red-500 transition text-xs"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          if (navigator.share) navigator.share({ url: shareUrl });
          else navigator.clipboard.writeText(shareUrl);
        }}
        className="text-sm text-gray-600 hover:text-gray-400 transition flex items-center gap-2"
      >
        Link teilen
        <span className="text-gray-800 font-mono">{gameId}</span>
      </button>

      <div className="w-full border-t border-gray-900 pt-4">
        <button
          onClick={() => setRulesOpen(o => !o)}
          className="w-full flex items-center justify-between text-xs text-gray-700 hover:text-gray-500 transition px-1"
        >
          <span className="tracking-widest uppercase">Regeln</span>
          <span>{rulesOpen ? "−" : "+"}</span>
        </button>
        {rulesOpen && (
          <div className="mt-3 flex flex-col gap-2 text-xs text-gray-600 px-1">
            <p>Der <span className="text-gray-400">Spielleiter</span> wählt einen Song aus seiner Spotify-Bibliothek und spielt ihn ab. Alle anderen hören zu.</p>
            <p>Wer den Song kennt, drückt <span className="text-gray-400">Buzz</span> — der Spielleiter entscheidet, ob die Antwort richtig ist.</p>
            <p>Bei <span className="text-gray-400">Richtig</span> gibt es einen Punkt. Dann ist der nächste Spieler dran.</p>
            <p>Schon vor der eigenen Runde kannst du Songs in deine <span className="text-gray-400">Warteschlange</span> legen, damit du schnell spielbereit bist.</p>
          </div>
        )}
      </div>
    </div>
  );
}
