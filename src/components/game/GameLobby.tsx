"use client";

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
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/game/${gameId}`
    : `/game/${gameId}`;

  const maxRounds = settings?.maxRounds ?? 5;

  const changeMaxRounds = async (delta: number) => {
    const next = Math.min(20, Math.max(1, maxRounds + delta));
    const res = await fetch(`/api/game/${gameId}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxRounds: next }),
    });
    if (res.ok && onGameData) onGameData(await res.json());
  };

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-xs">
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

      {onStart && (
        <div className="w-full flex items-center justify-between px-1">
          <span className="text-xs text-gray-600">Runden</span>
          <div className="flex items-center gap-3">
            <button onClick={() => changeMaxRounds(-1)} disabled={maxRounds <= 1}
              className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">
              −
            </button>
            <span className="text-white text-sm w-4 text-center">{maxRounds}</span>
            <button onClick={() => changeMaxRounds(1)} disabled={maxRounds >= 20}
              className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">
              +
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        {onStart ? (
          <button
            onClick={onStart}
            className="text-sm font-light text-white/80 hover:text-white border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-lg transition"
          >
            Starten
          </button>
        ) : (
          <p className="text-gray-800 text-xs">Warte auf den Spielleiter…</p>
        )}
        <button
          onClick={() => {
            if (navigator.share) navigator.share({ url: shareUrl });
            else navigator.clipboard.writeText(shareUrl);
          }}
          className="text-sm text-gray-600 hover:text-gray-400 transition"
        >
          Link teilen
        </button>
      </div>
    </div>
  );
}
