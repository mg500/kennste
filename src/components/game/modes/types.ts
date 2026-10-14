import type { ComponentType } from "react";
import type { GuessedSong } from "@/lib/game/modes/buzzer";
import type { Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";

export interface ModeRoundProps {
  game: Game;
  controls: GameControls;
  myId: string;
  accentColor?: string;
  playbackMs?: { current: number; duration: number; isPlaying: boolean };
}

export interface ModeSettingsProps {
  game: Game;
  controls: GameControls;
}

/** The UI half of a game mode (the logic half lives in lib/game/modes). */
export interface ModeUI {
  /** A running round, for every role (active player, opponents, viewers). */
  Round: ComponentType<ModeRoundProps>;
  /** Mode-specific settings in the lobby. */
  Settings: ComponentType<ModeSettingsProps>;
  /** Settings the host may change during a running game (host menu). */
  InGameSettings?: ComponentType<ModeSettingsProps>;
  /** Short rules shown in the lobby. */
  Rules: ComponentType;
  /** Songs each player collected, shown on the final scoreboard. */
  playerSongs?(game: Game): Record<string, GuessedSong[]>;
}
