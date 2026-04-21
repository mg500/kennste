export interface Player {
  id: string;
  name: string;
  joinedAt: number;
}

export interface Round {
  state: "picking" | "playing" | "buzzed";
  trackId?: string;
  songName?: string;
  artistName?: string;
  albumName?: string;
  releaseYear?: string;
  albumArt?: string;
  previewUrl?: string | null;
  buzzedBy?: string;
  buzzedPlayers: string[];
  buzzCounts: Record<string, number>;
  buzzedAt?: number;
  playingAt?: number;
  skippedPlayers: string[];
  wrongPlayers: string[];
  hintRevealed?: boolean;
  hintTitleRevealed?: boolean;
  hintArtistRevealed?: boolean;
  hintYearRevealed?: boolean;
}

export interface GuessedSong {
  songName: string;
  artistName: string;
  albumArt?: string;
}

export interface GameSettings {
  autoPauseOnBuzz: boolean;
  maxRounds: number;
  hintsEnabled: { cover: boolean; title: boolean; artist: boolean; year: boolean };
  playerOrder: "sequential" | "random";
  maxBuzzesPerRound: number;
  buzzTimeLimit: number;  // seconds after buzz to answer, 0 = no limit
  playTimeLimit: number;  // seconds before host can reveal, 0 = no limit
}

export interface LastResult {
  type: "correct" | "wrong" | "revealed";
  byPlayerName?: string;
}

export interface Game {
  id: string;
  players: Player[];
  createdAt: number;
  status: "lobby" | "playing" | "finished";
  hostPlayerId: string;
  hostToken?: string;
  currentPlayerIndex: number;
  currentRound: number;
  scores: Record<string, number>;
  guessedSongs: Record<string, GuessedSong[]>;
  settings: GameSettings;
  lastResult?: LastResult;
  round?: Round;
}

const g = globalThis as typeof globalThis & {
  __games__?: Map<string, Game>;
  __hostSessions__?: Map<string, { gameId: string; playerId: string }>;
};
if (!g.__games__) g.__games__ = new Map<string, Game>();
if (!g.__hostSessions__) g.__hostSessions__ = new Map();
const games = g.__games__;
const hostSessions = g.__hostSessions__;

export function createGame(hostToken?: string): Game {
  const id = Math.random().toString(36).substring(2, 8);
  const game: Game = {
    id, players: [], createdAt: Date.now(),
    status: "lobby", hostPlayerId: "",
    hostToken, currentPlayerIndex: 0, currentRound: 1, scores: {}, guessedSongs: {},
    settings: {
      autoPauseOnBuzz: true, maxRounds: 5,
      hintsEnabled: { cover: true, title: true, artist: true, year: true },
      playerOrder: "sequential", maxBuzzesPerRound: 1, buzzTimeLimit: 10, playTimeLimit: 30,
    },
  };
  games.set(id, game);
  setTimeout(() => games.delete(id), 2 * 60 * 60 * 1000);
  return game;
}

export function getGame(id: string): Game | undefined {
  return games.get(id);
}

export function deleteGame(id: string): boolean {
  return games.delete(id);
}

export function setHostSession(userId: string, gameId: string, playerId: string) {
  hostSessions.set(userId, { gameId, playerId });
}

export function getHostSession(userId: string) {
  return hostSessions.get(userId);
}

export function clearHostSession(userId: string) {
  hostSessions.delete(userId);
}

export function kickPlayer(id: string, playerId: string): Game | null {
  const game = games.get(id);
  if (!game || game.status !== "lobby") return null;
  game.players = game.players.filter(p => p.id !== playerId);
  delete game.scores[playerId];
  return game;
}

export function joinGame(id: string, name: string): { game: Game; playerId: string } | null {
  const game = games.get(id);
  if (!game) return null;
  const playerId = Math.random().toString(36).substring(2, 10);
  game.players.push({ id: playerId, name, joinedAt: Date.now() });
  game.scores[playerId] = 0;
  if (!game.hostPlayerId) game.hostPlayerId = playerId;
  return { game, playerId };
}

export function startGame(id: string): Game | null {
  const game = games.get(id);
  if (!game || game.status !== "lobby" || game.players.length === 0) return null;
  if (game.settings.playerOrder === "random") {
    for (let i = game.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [game.players[i], game.players[j]] = [game.players[j], game.players[i]];
    }
  }
  game.status = "playing";
  game.currentPlayerIndex = 0;
  game.currentRound = 1;
  game.round = { state: "picking", buzzedPlayers: [], buzzCounts: {}, skippedPlayers: [], wrongPlayers: [] };
  return game;
}

export function pickSong(
  id: string, playerId: string,
  trackId: string, songName: string, artistName: string,
  albumArt: string, previewUrl: string | null,
  albumName?: string, releaseYear?: string,
): Game | null {
  const game = games.get(id);
  if (!game || game.status !== "playing") return null;
  if (game.players[game.currentPlayerIndex]?.id !== playerId) return null;
  game.round = { state: "playing", trackId, songName, artistName, albumName, releaseYear, albumArt, previewUrl, playingAt: Date.now(), buzzedPlayers: [], buzzCounts: {}, skippedPlayers: [], wrongPlayers: [] };
  game.lastResult = undefined;
  return game;
}

export function buzz(id: string, playerId: string): Game | null {
  const game = games.get(id);
  if (!game || game.round?.state !== "playing") return null;
  if (game.players[game.currentPlayerIndex]?.id === playerId) return null;
  const buzzCounts = game.round.buzzCounts ?? {};
  if ((buzzCounts[playerId] ?? 0) >= game.settings.maxBuzzesPerRound) return null;
  const newCount = (buzzCounts[playerId] ?? 0) + 1;
  const alreadyInList = game.round.buzzedPlayers.includes(playerId);
  game.round = {
    ...game.round,
    state: "buzzed",
    buzzedBy: playerId,
    buzzedPlayers: alreadyInList ? game.round.buzzedPlayers : [...game.round.buzzedPlayers, playerId],
    buzzCounts: { ...buzzCounts, [playerId]: newCount },
    buzzedAt: Date.now(),
  };
  return game;
}

export function skipPlayer(id: string, playerId: string): Game | null {
  const game = games.get(id);
  if (!game || game.round?.state !== "playing") return null;
  if (game.players[game.currentPlayerIndex]?.id === playerId) return null;
  if (game.round.skippedPlayers.includes(playerId)) return null;
  game.round = { ...game.round, skippedPlayers: [...game.round.skippedPlayers, playerId] };
  return game;
}

export function judge(id: string, action: "correct" | "wrong" | "skip"): Game | null {
  const game = games.get(id);
  if (!game || !game.round) return null;
  if (action === "correct") {
    const winnerId = game.round.buzzedBy;
    const winnerName = game.players.find(p => p.id === winnerId)?.name;
    if (winnerId && game.scores[winnerId] !== undefined) {
      game.scores[winnerId]++;
      if (game.round.songName) {
        if (!game.guessedSongs[winnerId]) game.guessedSongs[winnerId] = [];
        game.guessedSongs[winnerId].push({
          songName: game.round.songName,
          artistName: game.round.artistName ?? "",
          albumArt: game.round.albumArt,
        });
      }
    }
    game.lastResult = { type: "correct", byPlayerName: winnerName };
    if (game.currentRound >= game.settings.maxRounds) {
      game.status = "finished";
      game.round = undefined;
    } else {
      game.currentRound++;
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
      game.round = { state: "picking", buzzedPlayers: [], buzzCounts: {}, skippedPlayers: [], wrongPlayers: [] };
    }
  } else if (action === "wrong") {
    const wrongId = game.round.buzzedBy;
    const wrongName = game.players.find(p => p.id === wrongId)?.name;
    const wrongPlayers = wrongId ? [...game.round.wrongPlayers, wrongId] : game.round.wrongPlayers;
    game.lastResult = { type: "wrong", byPlayerName: wrongName };
    game.round = { ...game.round, state: "playing", buzzedBy: undefined, skippedPlayers: game.round.skippedPlayers, wrongPlayers };
  } else {
    game.lastResult = { type: "revealed" };
    if (game.currentRound >= game.settings.maxRounds) {
      game.status = "finished";
      game.round = undefined;
    } else {
      game.currentRound++;
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
      game.round = { state: "picking", buzzedPlayers: [], buzzCounts: {}, skippedPlayers: [], wrongPlayers: [] };
    }
  }
  return game;
}

export function resetGame(id: string): Game | null {
  const game = games.get(id);
  if (!game) return null;
  game.status = "lobby";
  game.currentRound = 1;
  game.currentPlayerIndex = 0;
  game.round = undefined;
  game.lastResult = undefined;
  game.scores = Object.fromEntries(game.players.map(p => [p.id, 0]));
  game.guessedSongs = {};
  return game;
}
