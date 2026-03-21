export interface Player { id: string; name: string; }

export interface Round {
  state: "picking" | "playing" | "buzzed";
  trackId?: string;
  songName?: string;
  artistName?: string;
  albumArt?: string;
  previewUrl?: string | null;
  buzzedBy?: string;
  buzzedPlayers: string[];
}

export interface Track {
  id: string;
  name: string;
  artist: string;
  albumArt: string | null;
  previewUrl: string | null;
}

export interface GameData {
  id: string;
  players: Player[];
  status: "lobby" | "playing";
  hostPlayerId: string;
  currentPlayerIndex: number;
  scores: Record<string, number>;
  round?: Round;
}
