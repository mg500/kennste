import { getMode, isModeId, type ModeId } from "./modes";
import type { Context, Roles, Turn } from "./modes/types";
import type { Action, CoreAction, CoreSettings, Effect, Game, Player } from "./types";

export type { Context } from "./modes/types";

export type Result =
  | { ok: true; game: Game; effects: Effect[] }
  | { ok: false; error: string; status: 400 | 403 };

export function newGame(id: string, now: number, mode: ModeId = "buzzer"): Game {
  const m = getMode(mode);
  return {
    id, version: 0, players: [], createdAt: now,
    status: "lobby", hostPlayerId: "",
    currentPlayerIndex: 0, currentRound: 1, scores: {},
    settings: { goal: "rounds", maxRounds: 5, targetScore: 3, playerOrder: "sequential", songSource: "players", ...m.coreDefaults },
    mode: m.create(),
    viewers: [],
  };
}

export function addPlayer(prev: Game, player: Player): Game | null {
  if (prev.status !== "lobby") return null;
  const game = structuredClone(prev);
  game.players.push(player);
  game.scores[player.id] = 0;
  if (!game.hostPlayerId) game.hostPlayerId = player.id;
  return game;
}

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function applyCoreSettings(settings: CoreSettings, patch: Partial<CoreSettings>) {
  if (patch.goal === "rounds" || patch.goal === "score") settings.goal = patch.goal;
  if (intIn(patch.maxRounds, 1, 20)) settings.maxRounds = patch.maxRounds;
  if (intIn(patch.targetScore, 1, 20)) settings.targetScore = patch.targetScore;
  if (patch.playerOrder === "sequential" || patch.playerOrder === "random") settings.playerOrder = patch.playerOrder;
  if (patch.songSource === "players" || patch.songSource === "playlist") settings.songSource = patch.songSource;
}

/** Turn services handed to the mode. Mutates `game`; effects queued by the mode end up in `effects`. */
function turnApi(game: Game, ctx: Context, effects: Effect[]): Turn {
  const mode = getMode(game.mode.id);
  const turn: Turn = {
    ctx,
    effect(e) {
      effects.push(e);
    },
    nextPlaylistTrack() {
      const tracks = ctx.playlist;
      if (game.settings.songSource !== "playlist" || !tracks?.length) return null;
      const index = ((game.playlistIndex ?? -1) + 1) % tracks.length;
      game.playlistIndex = index;
      return tracks[index];
    },
    award(playerId, points) {
      game.scores[playerId] = (game.scores[playerId] ?? 0) + points;
    },
    endTurn() {
      const nextIndex = (game.currentPlayerIndex + 1) % game.players.length;
      const nextRound = nextIndex === 0 ? game.currentRound + 1 : game.currentRound;
      const { goal, maxRounds, targetScore } = game.settings;
      const scoreReached = Object.values(game.scores).some(s => s >= targetScore);
      if ((goal === "rounds" && nextRound > maxRounds) || (goal === "score" && scoreReached)) {
        game.status = "finished";
        return;
      }
      game.currentPlayerIndex = nextIndex;
      game.currentRound = nextRound;
      mode.startTurn(game, game.mode, turn);
    },
  };
  return turn;
}

export function applyAction(prev: Game, actorId: string, action: Action, ctx: Context): Result {
  const game = structuredClone(prev);
  const fail = (error: string, status: 400 | 403 = 400): Result => ({ ok: false, error, status });

  const isHost = actorId === game.hostPlayerId;
  const inLobby = game.status === "lobby";
  const isPlaying = game.status === "playing";
  const activePlayer = isPlaying ? game.players[game.currentPlayerIndex] : undefined;
  const isActive = activePlayer?.id === actorId;
  const mode = getMode(game.mode.id);
  const turnEffects: Effect[] = [];
  const turn = turnApi(game, ctx, turnEffects);
  const done = (effects: Effect[] = []): Result => ({ ok: true, game, effects: [...effects, ...turnEffects] });

  switch (action.type) {
    case "updateSettings":
      if (!isHost) return fail("Nur der Host darf Einstellungen ändern", 403);
      if (!inLobby) return fail("Spiel läuft bereits");
      applyCoreSettings(game.settings, action.patch);
      if (mode.requiresPlaylist) game.settings.songSource = "playlist";
      return done();

    case "updateModeSettings":
      if (!isHost) return fail("Nur der Host darf Einstellungen ändern", 403);
      mode.applySettings(game.mode, action.patch, inLobby);
      return done();

    case "setMode":
      if (!isHost) return fail("Nur der Host darf den Spielmodus wählen", 403);
      if (!inLobby) return fail("Spiel läuft bereits");
      if (action.mode !== game.mode.id) {
        const next = getMode(action.mode);
        game.mode = next.create();
        Object.assign(game.settings, next.coreDefaults);
      }
      return done();

    case "kick":
      if (!isHost) return fail("Nur der Host darf Spieler entfernen", 403);
      if (!inLobby) return fail("Spiel läuft bereits");
      if (action.playerId === game.hostPlayerId) return fail("Host kann nicht entfernt werden");
      game.players = game.players.filter(p => p.id !== action.playerId);
      game.viewers = game.viewers.filter(v => v !== action.playerId);
      delete game.scores[action.playerId];
      return done();

    case "toggleViewer":
      if (!isHost) return fail("Nur der Host darf Zuschauer festlegen", 403);
      if (!inLobby) return fail("Spiel läuft bereits");
      if (action.playerId === game.hostPlayerId) return fail("Host kann nicht Zuschauer sein");
      if (!game.players.some(p => p.id === action.playerId)) return fail("Spieler nicht gefunden");
      game.viewers = game.viewers.includes(action.playerId)
        ? game.viewers.filter(v => v !== action.playerId)
        : [...game.viewers, action.playerId];
      return done();

    case "start": {
      if (!isHost) return fail("Nur der Host darf starten", 403);
      if (!inLobby) return fail("Spiel läuft bereits");
      if (game.settings.songSource === "playlist" && !ctx.playlist?.length) return fail("Keine Playlist geladen");
      const active = game.players.filter(p => !game.viewers.includes(p.id));
      if (active.length === 0) return fail("Keine aktiven Spieler");
      game.viewerPlayers = game.players.filter(p => game.viewers.includes(p.id));
      game.players = active;
      if (game.settings.playerOrder === "random") {
        for (let i = game.players.length - 1; i > 0; i--) {
          const j = Math.floor(ctx.random() * (i + 1));
          [game.players[i], game.players[j]] = [game.players[j], game.players[i]];
        }
      }
      game.status = "playing";
      game.currentPlayerIndex = 0;
      game.currentRound = 1;
      game.playlistIndex = undefined;
      mode.clear(game.mode);
      mode.startTurn(game, game.mode, turn);
      return done();
    }

    case "reset": {
      if (!isHost) return fail("Nur der Host darf zurücksetzen", 403);
      if (inLobby) return fail("Spiel ist bereits in der Lobby");
      const all = [...game.players, ...(game.viewerPlayers ?? [])].sort((a, b) => a.joinedAt - b.joinedAt);
      game.players = all;
      game.viewerPlayers = undefined;
      game.status = "lobby";
      game.currentRound = 1;
      game.currentPlayerIndex = 0;
      game.playlistIndex = undefined;
      game.scores = Object.fromEntries(all.map(p => [p.id, 0]));
      mode.clear(game.mode);
      return done();
    }

    case "play":
    case "pause":
    case "seek":
      if (!isActive && !isHost) return fail("Nur der aktuelle Spieler darf die Wiedergabe steuern", 403);
      if (!isPlaying) return fail("Spiel läuft nicht");
      return done([action]);
  }

  // Everything else belongs to the mode
  if (!isPlaying) return fail("Spiel läuft nicht");
  const roles: Roles = {
    actorId, isHost, isActive, activePlayer,
    // During a game, viewers are moved out of `players`, so this excludes them
    isOpponent: !isActive && game.players.some(p => p.id === actorId),
  };
  const result = mode.apply(game, game.mode, roles, action, turn);
  if (!result.ok) return fail(result.error, result.status);
  return done(result.effects);
}

// ── Input validation for untrusted request bodies ───────────────────────────

const str = (v: unknown, max = 500): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function parseCoreAction(a: Record<string, unknown>): CoreAction | null | undefined {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  switch (a.type) {
    case "start": case "reset": case "pause":
      return { type: a.type };
    case "updateSettings":
      return obj(a.patch) ? { type: a.type, patch: a.patch as Partial<CoreSettings> } : null;
    case "updateModeSettings":
      return obj(a.patch) ? { type: a.type, patch: a.patch } : null;
    case "setMode":
      return isModeId(a.mode) ? { type: a.type, mode: a.mode } : null;
    case "kick": case "toggleViewer":
      return str(a.playerId, 64) ? { type: a.type, playerId: a.playerId } : null;
    case "play":
      return a.trackId === undefined ? { type: a.type } : str(a.trackId, 64) ? { type: a.type, trackId: a.trackId } : null;
    case "seek":
      return typeof a.positionMs === "number" && a.positionMs >= 0 ? { type: a.type, positionMs: Math.round(a.positionMs) } : null;
    default:
      return undefined; // not a core action
  }
}

/** Validates an untrusted action for a game in the given mode. */
export function parseAction(body: unknown, modeId: ModeId): Action | null {
  if (!body || typeof body !== "object") return null;
  const a = body as Record<string, unknown>;
  const core = parseCoreAction(a);
  if (core !== undefined) return core;
  return getMode(modeId).parseAction(a);
}
