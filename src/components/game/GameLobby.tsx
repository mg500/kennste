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

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      {children}
    </div>
  );
}

function Stepper({ value, onDec, onInc, disableDec, disableInc, display }: {
  value: number; display?: string;
  onDec: () => void; onInc: () => void;
  disableDec: boolean; disableInc: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onDec} disabled={disableDec}
        className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">−</button>
      <span className="text-white text-sm w-8 text-center">{display ?? value}</span>
      <button onClick={onInc} disabled={disableInc}
        className="w-7 h-7 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white disabled:opacity-20 transition text-sm">+</button>
    </div>
  );
}


export function GameLobby({ players, myId, gameId, settings, onStart, onGameData }: Props) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(!!onStart);
  const [lobbyOpen, setLobbyOpen] = useState(true);
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
            <p>Der <span className="text-gray-400">Spielleiter</span> wählt einen Song aus seiner Spotify-Bibliothek und spielt ihn ab. Alle anderen hören zu.</p>
            <p>Wer den Song kennt, drückt <span className="text-gray-400">Buzz</span> — der Spielleiter entscheidet, ob die Antwort richtig ist.</p>
            <p>Bei <span className="text-gray-400">Richtig</span> gibt es einen Punkt. Dann ist der nächste Spieler dran.</p>
            <p>Schon vor der eigenen Runde kannst du Songs in deine <span className="text-gray-400">Warteschlange</span> legen, damit du schnell spielbereit bist.</p>
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
          <SettingRow label="Modus">
            <div className="flex items-center gap-1">
              {(["rounds", "bestOf"] as const).map(m => (
                <button key={m} onClick={() => updateSetting({ gameMode: m })}
                  className={`text-xs px-2.5 py-1 rounded transition ${gameMode === m ? "bg-gray-700 text-white" : "text-gray-600 hover:text-gray-400"}`}>
                  {m === "rounds" ? "Runden" : "Best of"}
                </button>
              ))}
            </div>
          </SettingRow>
          {gameMode === "rounds" ? (
            <SettingRow label="">
              <Stepper value={maxRounds}
                onDec={() => updateSetting({ maxRounds: Math.max(1, maxRounds - 1) })}
                onInc={() => updateSetting({ maxRounds: Math.min(20, maxRounds + 1) })}
                disableDec={maxRounds <= 1} disableInc={maxRounds >= 20} />
            </SettingRow>
          ) : (
            <SettingRow label="">
              <Stepper value={bestOf}
                onDec={() => updateSetting({ bestOf: Math.max(1, bestOf - 1) })}
                onInc={() => updateSetting({ bestOf: Math.min(20, bestOf + 1) })}
                disableDec={bestOf <= 1} disableInc={bestOf >= 20} />
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
          <SettingRow label="Tipps">
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
          </SettingRow>
          <SettingRow label="Buzzer / Runde">
            <Stepper value={maxBuzzes}
              onDec={() => updateSetting({ maxBuzzesPerRound: Math.max(1, maxBuzzes - 1) })}
              onInc={() => updateSetting({ maxBuzzesPerRound: Math.min(5, maxBuzzes + 1) })}
              disableDec={maxBuzzes <= 1} disableInc={maxBuzzes >= 5} />
          </SettingRow>
          <SettingRow label="Zeitlimit Auflösen">
            <Stepper value={playTimeLimit}
              display={playTimeLimit === 0 ? "∞" : `${playTimeLimit}s`}
              onDec={() => updateSetting({ playTimeLimit: Math.max(0, playTimeLimit - 5) })}
              onInc={() => updateSetting({ playTimeLimit: Math.min(300, playTimeLimit + 5) })}
              disableDec={playTimeLimit <= 0} disableInc={playTimeLimit >= 300} />
          </SettingRow>
          <SettingRow label="Zeitlimit Antworten">
            <Stepper value={buzzTimeLimit}
              display={buzzTimeLimit === 0 ? "∞" : `${buzzTimeLimit}s`}
              onDec={() => updateSetting({ buzzTimeLimit: Math.max(0, buzzTimeLimit - 5) })}
              onInc={() => updateSetting({ buzzTimeLimit: Math.min(120, buzzTimeLimit + 5) })}
              disableDec={buzzTimeLimit <= 0} disableInc={buzzTimeLimit >= 120} />
          </SettingRow>
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
