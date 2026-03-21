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
}

export interface Game {
  id: string;
  players: Player[];
  createdAt: number;
  status: "lobby" | "playing";
  hostPlayerId: string;
  hostToken?: string;
  currentPlayerIndex: number;
  scores: Record<string, number>;
  guessedSongs: Record<string, GuessedSong[]>;
  settings: GameSettings;
  round?: Round;
}

const games = new Map<string, Game>();

export function createGame(hostToken?: string): Game {
  const id = Math.random().toString(36).substring(2, 8);
  const game: Game = {
    id, players: [], createdAt: Date.now(),
    status: "lobby", hostPlayerId: "",
    hostToken, currentPlayerIndex: 0, scores: {}, guessedSongs: {},
    settings: { autoPauseOnBuzz: false },
  };
  games.set(id, game);
  setTimeout(() => games.delete(id), 2 * 60 * 60 * 1000);
  return game;
}

export function getGame(id: string): Game | undefined {
  return games.get(id);
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
  game.status = "playing";
  game.currentPlayerIndex = 0;
  game.round = { state: "picking", buzzedPlayers: [], skippedPlayers: [], wrongPlayers: [] };
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
  game.round = { state: "playing", trackId, songName, artistName, albumName, releaseYear, albumArt, previewUrl, buzzedPlayers: [], skippedPlayers: [], wrongPlayers: [] };
  return game;
}

export function buzz(id: string, playerId: string): Game | null {
  const game = games.get(id);
  if (!game || game.round?.state !== "playing") return null;
  if (game.players[game.currentPlayerIndex]?.id === playerId) return null;
  if (game.round.buzzedPlayers.includes(playerId)) return null;
  game.round = {
    ...game.round,
    state: "buzzed",
    buzzedBy: playerId,
    buzzedPlayers: [...game.round.buzzedPlayers, playerId],
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
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    game.round = { state: "picking", buzzedPlayers: [], skippedPlayers: [], wrongPlayers: [] };
  } else if (action === "wrong") {
    // buzzedPlayers bleibt — der Spieler kann nicht nochmal buzzern
    const wrongId = game.round.buzzedBy;
    const wrongPlayers = wrongId ? [...game.round.wrongPlayers, wrongId] : game.round.wrongPlayers;
    game.round = { ...game.round, state: "playing", buzzedBy: undefined, skippedPlayers: game.round.skippedPlayers, wrongPlayers };
  } else {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    game.round = { state: "picking", buzzedPlayers: [], skippedPlayers: [], wrongPlayers: [] };
  }
  return game;
}
