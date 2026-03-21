"use client";

import { Player } from "./types";

interface Props {
  players: Player[];
  myId: string;
  gameId: string;
  onStart?: () => void;
}

export function GameLobby({ players, myId, gameId, onStart }: Props) {
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/game/${gameId}`
    : `/game/${gameId}`;

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-xs">
      <p className="text-gray-600 text-xs tracking-widest uppercase">Lobby</p>
      <div className="w-full flex flex-col gap-1">
        {players.map(p => (
          <div key={p.id} className={`text-sm py-2 px-3 rounded-lg flex justify-between ${p.id === myId ? "bg-gray-900" : ""}`}>
            <span className={p.id === myId ? "text-white" : "text-gray-500"}>{p.name}</span>
            {p.id === myId && <span className="text-gray-700 text-xs">du</span>}
          </div>
        ))}
      </div>
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
