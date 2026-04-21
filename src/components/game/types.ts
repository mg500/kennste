export interface Player { id: string; name: string; }

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
  skippedPlayers: string[];
  wrongPlayers: string[];
  hintRevealed?: boolean;
  hintTitleRevealed?: boolean;
  hintArtistRevealed?: boolean;
  hintYearRevealed?: boolean;
}

export interface Track {
  id: string;
  name: string;
  artist: string;
  album?: string;
  releaseYear?: string;
  albumArt: string | null;
  previewUrl: string | null;
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
  buzzTimeLimit: number; // seconds, 0 = no limit
}

export interface LastResult {
  type: "correct" | "wrong" | "revealed";
  byPlayerName?: string;
}

export interface GameData {
  id: string;
  players: Player[];
  status: "lobby" | "playing" | "finished";
  hostPlayerId: string;
  currentPlayerIndex: number;
  currentRound: number;
  scores: Record<string, number>;
  guessedSongs: Record<string, GuessedSong[]>;
  settings: GameSettings;
  lastResult?: LastResult;
  round?: Round;
}
