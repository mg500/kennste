import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Game } from "@/lib/game/types";
import type { GameControls, ReceivedPlayback } from "@/lib/game/useGameSession";

export interface ModeRoundProps {
  game: Game;
  controls: GameControls;
  myId: string;
  playback: ReceivedPlayback | null;
  /** Opens the host menu (only passed to the host). */
  onMenu?: () => void;
}

export interface ModeScreenProps {
  game: Game;
  playback: ReceivedPlayback | null;
}

export interface ModeSettingsProps {
  game: Game;
  controls: GameControls;
}

/** The UI half of a game mode (the logic half lives in lib/game/modes). */
export interface ModeUI {
  icon: LucideIcon;
  /** One line for the mode card. */
  tagline: string;
  /** A running round on a player's phone, for every role (active player, opponents, viewers). */
  Round: ComponentType<ModeRoundProps>;
  /** A running round on the shared TV view (read-only). */
  Screen: ComponentType<ModeScreenProps>;
  /** The TV view shows the players itself (`PlayerCards`) – no standings column, the round gets the whole width. */
  playerCards?: boolean;
  /** Full-width part of the TV view below the score panel (e.g. the timeline, which needs the room). */
  ScreenWide?: ComponentType<ModeScreenProps>;
  /** A running round for spectators on a phone (read-only, same page as the TV view). */
  Watch: ComponentType<ModeScreenProps>;
  /** Mode-specific settings rows in the lobby card, the ones that change the game most first. */
  Settings: ComponentType<ModeSettingsProps>;
  /** Settings the host may change during a running game (host menu). */
  InGameSettings?: ComponentType<ModeSettingsProps>;
  /** Short rules ("So geht's"). */
  Rules: ComponentType;
  /** Rule summary chips for the lobby. */
  summary(game: Game): string[];
  /** Final screen content instead of the standings when the mode reports a team result (see GameMode.teamResult). */
  TeamSummary?: ComponentType<{ game: Game }>;
}
