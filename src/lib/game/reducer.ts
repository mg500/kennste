import { getMode, isModeId, type ModeId } from "./modes";
import { modeName } from "./modes/groups";
import type { Context, Roles, Turn } from "./modes/types";
import type { Action, CoreAction, CoreSettings, Effect, EveningGame, Game, Player } from "./types";
import { intIn, obj, str } from "./validate";

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
    settings: { goal: "rounds", maxRounds: 5, targetScore: 3, songSource: songSourceOf(mode), ...m.coreDefaults },
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

/** Where the songs come from follows from the mode: players pick them in the buzzer quiz, every other mode plays a playlist. */
export const songSourceOf = (mode: ModeId): CoreSettings["songSource"] => (getMode(mode).requiresPlaylist ? "playlist" : "players");

function applyCoreSettings(settings: CoreSettings, patch: Partial<CoreSettings>) {
  if (patch.goal === "rounds" || patch.goal === "score") settings.goal = patch.goal;
  if (intIn(patch.maxRounds, 1, 20)) settings.maxRounds = patch.maxRounds;
  if (intIn(patch.targetScore, 1, 20)) settings.targetScore = patch.targetScore;
}

/** Who plays next, or null if the game ends after the current turn. */
export function nextTurnPlayer(game: Game): Player | null {
  if (game.players.length === 0) return null;
  const { nextIndex, nextRound } = nextPosition(game);
  const { goal, maxRounds, targetScore } = game.settings;
  if (goal === "rounds" && nextRound > maxRounds) return null;
  if (goal === "score" && Object.values(game.scores).some(s => s >= targetScore)) return null;
  return game.players[nextIndex];
}

/** Turn order position after the current turn. In simultaneous modes every turn is a new round. */
function nextPosition(game: Game) {
  if (getMode(game.mode.id).simultaneous) return { nextIndex: game.currentPlayerIndex, nextRound: game.currentRound + 1 };
  const nextIndex = (game.currentPlayerIndex + 1) % game.players.length;
  return { nextIndex, nextRound: nextIndex === 0 ? game.currentRound + 1 : game.currentRound };
}

/** A round was revealed and the game waits for someone to continue (see continuingPlayer). */
export function awaitingContinue(game: Game): boolean {
  return game.status === "playing" && game.mode.round?.state === "revealed";
}

/** Seconds between a majority wanting to continue and the game continuing on its own. */
export const CONTINUE_COUNTDOWN_SEC = 5;

/** Back in the lobby: the game just played joins the evening – its result, and its songs (each song once). */
function addToEvening(game: Game) {
  if (!game.history?.length) return;
  const known = new Set(game.evening?.songs.map(s => s.trackId));
  const added = game.history.map(r => r.song).filter(s => !known.has(s.trackId) && known.add(s.trackId));
  const team = getMode(game.mode.id).teamResult?.(game.mode);
  const played: EveningGame = {
    mode: game.mode.id,
    name: modeName(game.mode),
    songs: game.history.length,
    ranking: game.players.map(p => ({ name: p.name, score: game.scores[p.id] ?? 0 })).sort((a, b) => b.score - a.score),
    ...(team ? { team: { won: team.won } } : {}),
  };
  game.evening = { games: [...(game.evening?.games ?? []), played], songs: [...(game.evening?.songs ?? []), ...added] };
}

/** Ends a running or finished game: everyone is back in the lobby, the game joins the evening. */
function backToLobby(game: Game) {
  addToEvening(game);
  const all = [...game.players, ...(game.viewerPlayers ?? [])].sort((a, b) => a.joinedAt - b.joinedAt);
  game.players = all;
  game.viewerPlayers = undefined;
  game.status = "lobby";
  game.currentRound = 1;
  game.currentPlayerIndex = 0;
  game.outOfSongs = undefined;
  game.scores = Object.fromEntries(all.map(p => [p.id, 0]));
  game.history = undefined;
  getMode(game.mode.id).clear(game.mode);
}

/** Seconds from "Spiel starten" to the start; the server prepares the songs meanwhile. */
export const START_COUNTDOWN_SEC = 3;

/** Votes needed to continue without the continuing player: more than half of everyone else. */
export function continueVotesNeeded(game: Game): number {
  return Math.floor((game.players.length - 1) / 2) + 1;
}

/**
 * The player who continues after a revealed round: the next one, or the active one before the final
 * standings. In simultaneous modes the host.
 */
export function continuingPlayer(game: Game): Player | undefined {
  if (getMode(game.mode.id).simultaneous) return game.players.find(p => p.id === game.hostPlayerId);
  return nextTurnPlayer(game) ?? game.players[game.currentPlayerIndex];
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
      // No wrap-around: songs never repeat within a game (the server loads more in time, see store.ts)
      const index = (game.playlistIndex ?? -1) + 1;
      if (index >= tracks.length) return null;
      game.playlistIndex = index;
      return tracks[index];
    },
    award(playerId, points) {
      game.scores[playerId] = (game.scores[playerId] ?? 0) + points;
    },
    record(entry) {
      (game.history ??= []).push({ round: game.currentRound, ...entry });
    },
    finishGame() {
      game.status = "finished";
    },
    outOfSongs() {
      game.status = "finished";
      game.outOfSongs = true;
    },
    endTurn() {
      if (!nextTurnPlayer(game)) {
        game.status = "finished";
        return;
      }
      const { nextIndex, nextRound } = nextPosition(game);
      game.currentRound = nextRound;
      game.currentPlayerIndex = nextIndex;
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
  const mode = getMode(game.mode.id);
  const activePlayer = isPlaying && !mode.simultaneous ? game.players[game.currentPlayerIndex] : undefined;
  const isActive = activePlayer?.id === actorId;
  const turnEffects: Effect[] = [];
  const turn = turnApi(game, ctx, turnEffects);
  const cannotStart = () => {
    if (!isHost) return fail("Nur der Host darf starten", 403);
    if (!inLobby) return fail("Spiel läuft bereits");
    if (game.settings.songSource === "playlist" && game.playlistPreparing) return fail("Die Songs werden noch vorbereitet");
    if (game.settings.songSource === "playlist" && !ctx.playlist?.length) return fail("Keine Playlist geladen");
    if (!game.players.some(p => !game.viewers.includes(p.id))) return fail("Keine aktiven Spieler");
    return null;
  };
  const done = (effects: Effect[] = []): Result => {
    // Votes belong to the revealed round they were cast in
    if (!awaitingContinue(game)) delete game.continueVote;
    return { ok: true, game, effects: [...effects, ...turnEffects] };
  };

  if (game.closedAt) return fail("Die Lobby ist geschlossen");
  // Nothing changes what is about to start
  const lobbyChanges = ["updateSettings", "updateModeSettings", "setMode", "kick", "toggleViewer"];
  if (inLobby && game.countdown && lobbyChanges.includes(action.type)) return fail("Das Spiel startet gerade");

  switch (action.type) {
    case "updateSettings":
      if (!isHost) return fail("Nur der Host darf Einstellungen ändern", 403);
      if (!inLobby) return fail("Spiel läuft bereits");
      applyCoreSettings(game.settings, action.patch);
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
        game.settings.songSource = songSourceOf(action.mode);
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

    case "setScreenView":
      if (!isHost) return fail("Nur der Host darf die TV-Ansicht umschalten", 403);
      game.screenView = action.view === "lobby" ? undefined : action.view;
      return done();

    case "countdown": {
      const error = cannotStart();
      if (error) return error;
      game.countdown ??= { endsAt: ctx.now + START_COUNTDOWN_SEC * 1000 };
      return done();
    }

    case "cancelCountdown":
      if (!isHost) return fail("Nur der Host darf abbrechen", 403);
      if (!inLobby || !game.countdown) return fail("Gerade startet nichts");
      delete game.countdown;
      return done();

    case "start": {
      const error = cannotStart();
      if (error) return error;
      const active = game.players.filter(p => !game.viewers.includes(p.id));
      delete game.countdown;
      game.viewerPlayers = game.players.filter(p => game.viewers.includes(p.id));
      game.players = active;
      game.status = "playing";
      game.currentPlayerIndex = 0;
      game.currentRound = 1;
      game.outOfSongs = undefined;
      game.history = [];
      // A rematch continues with songs not played yet; only a used-up playlist starts over
      if ((game.playlistIndex ?? -1) + 1 >= (ctx.playlist?.length ?? 0)) game.playlistIndex = undefined;
      mode.clear(game.mode);
      mode.startTurn(game, game.mode, turn);
      return done();
    }

    case "reset": {
      if (!isHost) return fail("Nur der Host darf zurücksetzen", 403);
      if (inLobby) return fail("Spiel ist bereits in der Lobby");
      backToLobby(game);
      // The music plays on in the lobby (see continueInLobby in the store)
      return done();
    }

    case "close": {
      if (!isHost) return fail("Nur der Host darf die Lobby schließen", 403);
      const wasRunning = isPlaying;
      if (!inLobby) backToLobby(game);
      delete game.countdown;
      game.closedAt = ctx.now;
      return done(wasRunning ? [{ type: "pause" }] : []);
    }

    case "voteContinue": {
      if (!awaitingContinue(game)) return fail("Gerade wartet niemand");
      if (continuingPlayer(game)?.id === actorId) return fail("Du bist selbst dran");
      // Viewers are not in `players` during a game
      if (!game.players.some(p => p.id === actorId)) return fail("Nur Mitspieler können abstimmen", 403);
      const ids = new Set(game.continueVote?.playerIds);
      if (action.want) ids.add(actorId);
      else ids.delete(actorId);
      const majority = ids.size >= continueVotesNeeded(game);
      game.continueVote = ids.size
        ? { playerIds: [...ids], ...(majority ? { countdownAt: game.continueVote?.countdownAt ?? ctx.now } : {}) }
        : undefined;
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
    mayContinue: isHost || continuingPlayer(game)?.id === actorId,
  };
  const result = mode.apply(game, game.mode, roles, action, turn);
  if (!result.ok) return fail(result.error, result.status);
  return done(result.effects);
}

// ── Input validation for untrusted request bodies ───────────────────────────

function parseCoreAction(a: Record<string, unknown>): CoreAction | null | undefined {
  switch (a.type) {
    case "start": case "countdown": case "cancelCountdown": case "reset": case "pause":
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
    case "setScreenView":
      return a.view === "lobby" || a.view === "nowPlaying" ? { type: a.type, view: a.view } : null;
    case "voteContinue":
      return typeof a.want === "boolean" ? { type: a.type, want: a.want } : null;
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
