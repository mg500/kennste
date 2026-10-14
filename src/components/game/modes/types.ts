import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Action, CoreSettings, Game } from "@/lib/game/types";
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

export interface PlayerDetailsProps {
  game: Game;
  playerId: string;
}

export interface ModeSettingsProps {
  game: Game;
  controls: GameControls;
}

export interface Preset {
  id: string;
  label: string;
  sub: string;
  core: Partial<CoreSettings>;
  mode: Record<string, unknown>;
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
  /** A running round for spectators on a phone (read-only, same page as the TV view). */
  Watch: ComponentType<ModeScreenProps>;
  /** Mode-specific rows in the rules sheet. */
  Settings: ComponentType<ModeSettingsProps>;
  /** Settings the host may change during a running game (host menu). */
  InGameSettings?: ComponentType<ModeSettingsProps>;
  /** Short rules ("So geht's"). */
  Rules: ComponentType;
  /** Rule summary chips for the lobby. */
  summary(game: Game): string[];
  presets: Preset[];
  /** Final screen content instead of the standings when the mode reports a team result (see GameMode.teamResult). */
  TeamSummary?: ComponentType<{ game: Game }>;
  /** Extra details below a player on the final standings (e.g. guessed songs). */
  PlayerDetails?: ComponentType<PlayerDetailsProps>;
}

/** Applies a preset by sending its core and mode settings. */
export async function applyPreset(act: (a: Action) => Promise<void>, preset: Preset) {
  await act({ type: "updateSettings", patch: preset.core });
  await act({ type: "updateModeSettings", patch: preset.mode });
}

/** True if all values of the preset match the current settings. */
export function isPresetActive(game: Game, preset: Preset) {
  const core = game.settings as unknown as Record<string, unknown>;
  const mode = game.mode.settings as unknown as Record<string, unknown>;
  return Object.entries(preset.core).every(([k, v]) => core[k] === v)
    && Object.entries(preset.mode).every(([k, v]) => mode[k] === v);
}
