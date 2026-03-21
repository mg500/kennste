export interface Player {
  id: string;
  name: string;
  joinedAt: number;
}

export interface Game {
  id: string;
  players: Player[];
  createdAt: number;
}

const games = new Map<string, Game>();

export function createGame(): Game {
  const id = Math.random().toString(36).substring(2, 8);
  const game: Game = { id, players: [], createdAt: Date.now() };
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
  return { game, playerId };
}
