import type { Action, Effect, Game, GameSettings, HintField, Player, Round, SongInfo, Track } from "./types";

export interface Context {
  now: number;
  random: () => number;
  playlist?: Track[];
}

export type Result =
  | { ok: true; game: Game; effects: Effect[] }
  | { ok: false; error: string; status: 400 | 403 };

const HINT_FIELDS: HintField[] = ["cover", "title", "artist", "year"];
const HINT_FLAG: Record<HintField, keyof Round> = {
  cover: "hintRevealed",
  title: "hintTitleRevealed",
  artist: "hintArtistRevealed",
  year: "hintYearRevealed",
};

export function newGame(id: string, now: number): Game {
  return {
    id, version: 0, players: [], createdAt: now,
    status: "lobby", hostPlayerId: "",
    currentPlayerIndex: 0, currentRound: 1, scores: {}, guessedSongs: {},
    settings: {
      autoPauseOnBuzz: true, gameMode: "rounds", maxRounds: 5, bestOf: 3,
      hintsEnabled: { cover: true, title: false, artist: true, year: true },
      playerOrder: "sequential", maxBuzzesPerRound: 1, buzzTimeLimit: 10, playTimeLimit: 30,
      songSource: "players",
    },
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

function songOf(round: Round): SongInfo | undefined {
  return round.songName
    ? { name: round.songName, artist: round.artistName ?? "", releaseYear: round.releaseYear, albumArt: round.albumArt || null }
    : undefined;
}

function emptyRound(): Round {
  return { state: "picking", buzzedPlayers: [], buzzCounts: {}, skippedPlayers: [], wrongPlayers: [] };
}

function playingRound(track: Track, now: number): Round {
  return {
    ...emptyRound(), state: "playing", playingAt: now,
    trackId: track.id, songName: track.name, artistName: track.artist, albumName: track.album,
    releaseYear: track.releaseYear, albumArt: track.albumArt ?? "", previewUrl: track.previewUrl,
  };
}

/** Starts the next round: next playlist track, or picking state in players mode. */
function nextRound(game: Game, ctx: Context) {
  const tracks = ctx.playlist;
  if (game.settings.songSource === "playlist" && tracks?.length) {
    const index = ((game.playlistIndex ?? -1) + 1) % tracks.length;
    game.playlistIndex = index;
    game.round = playingRound(tracks[index], ctx.now);
  } else {
    game.round = emptyRound();
  }
}

function advanceTurn(game: Game, ctx: Context) {
  const nextIndex = (game.currentPlayerIndex + 1) % game.players.length;
  const nextRoundNo = nextIndex === 0 ? game.currentRound + 1 : game.currentRound;
  if (game.settings.gameMode === "rounds" && nextRoundNo > game.settings.maxRounds) {
    game.status = "finished";
    game.round = undefined;
    return;
  }
  game.currentPlayerIndex = nextIndex;
  game.currentRound = nextRoundNo;
  nextRound(game, ctx);
}

/** Settings that may still be changed while a game is running. */
const IN_GAME_SETTINGS: (keyof GameSettings)[] = ["autoPauseOnBuzz"];

function applySettings(settings: GameSettings, patch: Partial<GameSettings>, inLobby: boolean) {
  const allowed = (key: keyof GameSettings) => inLobby || IN_GAME_SETTINGS.includes(key);
  const intIn = (v: unknown, min: number, max: number): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

  if (allowed("autoPauseOnBuzz") && typeof patch.autoPauseOnBuzz === "boolean") settings.autoPauseOnBuzz = patch.autoPauseOnBuzz;
  if (allowed("gameMode") && (patch.gameMode === "rounds" || patch.gameMode === "bestOf")) settings.gameMode = patch.gameMode;
  if (allowed("maxRounds") && intIn(patch.maxRounds, 1, 20)) settings.maxRounds = patch.maxRounds;
  if (allowed("bestOf") && intIn(patch.bestOf, 1, 20)) settings.bestOf = patch.bestOf;
  if (allowed("playerOrder") && (patch.playerOrder === "sequential" || patch.playerOrder === "random")) settings.playerOrder = patch.playerOrder;
  if (allowed("maxBuzzesPerRound") && intIn(patch.maxBuzzesPerRound, 1, 5)) settings.maxBuzzesPerRound = patch.maxBuzzesPerRound;
  if (allowed("buzzTimeLimit") && intIn(patch.buzzTimeLimit, 0, 120)) settings.buzzTimeLimit = patch.buzzTimeLimit;
  if (allowed("playTimeLimit") && intIn(patch.playTimeLimit, 0, 300)) settings.playTimeLimit = patch.playTimeLimit;
  if (allowed("songSource") && (patch.songSource === "players" || patch.songSource === "playlist")) settings.songSource = patch.songSource;
  if (allowed("hintsEnabled") && patch.hintsEnabled && typeof patch.hintsEnabled === "object") {
    for (const field of HINT_FIELDS) {
      const v = patch.hintsEnabled[field];
      if (typeof v === "boolean") settings.hintsEnabled[field] = v;
    }
  }
}

export function applyAction(prev: Game, actorId: string, action: Action, ctx: Context): Result {
  const game = structuredClone(prev);
  const effects: Effect[] = [];
  const fail = (error: string, status: 400 | 403 = 400): Result => ({ ok: false, error, status });

  const isHost = actorId === game.hostPlayerId;
  const inLobby = game.status === "lobby";
  const isPlaying = game.status === "playing";
  const picker = isPlaying ? game.players[game.currentPlayerIndex] : undefined;
  const isPicker = picker?.id === actorId;
  // During a game, viewers are moved out of `players`, so this excludes them
  const isGuesser = isPlaying && !isPicker && game.players.some(p => p.id === actorId);
  const round = game.round;

  switch (action.type) {
    case "updateSettings":
      if (!isHost) return fail("Nur der Host darf Einstellungen ändern", 403);
      applySettings(game.settings, action.patch, inLobby);
      break;

    case "kick":
      if (!isHost) return fail("Nur der Host darf Spieler entfernen", 403);
      if (!inLobby) return fail("Spiel läuft bereits");
      if (action.playerId === game.hostPlayerId) return fail("Host kann nicht entfernt werden");
      game.players = game.players.filter(p => p.id !== action.playerId);
      game.viewers = game.viewers.filter(v => v !== action.playerId);
      delete game.scores[action.playerId];
      break;

    case "toggleViewer":
      if (!isHost) return fail("Nur der Host darf Zuschauer festlegen", 403);
      if (!inLobby) return fail("Spiel läuft bereits");
      if (action.playerId === game.hostPlayerId) return fail("Host kann nicht Zuschauer sein");
      if (!game.players.some(p => p.id === action.playerId)) return fail("Spieler nicht gefunden");
      game.viewers = game.viewers.includes(action.playerId)
        ? game.viewers.filter(v => v !== action.playerId)
        : [...game.viewers, action.playerId];
      break;

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
      game.lastResult = undefined;
      nextRound(game, ctx);
      break;
    }

    case "pickSong":
      if (!isPicker) return fail("Du bist nicht dran", 403);
      if (round?.state !== "picking") return fail("Gerade kann kein Song gewählt werden");
      if (game.settings.songSource === "playlist") return fail("Songs kommen aus der Playlist");
      game.round = playingRound(action.track, ctx.now);
      game.lastResult = undefined;
      effects.push({ type: "play", trackId: action.track.id });
      break;

    case "buzz": {
      if (!isGuesser) return fail("Du kannst gerade nicht buzzern", 403);
      if (round?.state !== "playing") return fail("Gerade läuft kein Song");
      const count = round.buzzCounts[actorId] ?? 0;
      if (count >= game.settings.maxBuzzesPerRound) return fail("Keine Buzzer mehr übrig");
      game.round = {
        ...round,
        state: "buzzed",
        buzzedBy: actorId,
        buzzedPlayers: round.buzzedPlayers.includes(actorId) ? round.buzzedPlayers : [...round.buzzedPlayers, actorId],
        buzzCounts: { ...round.buzzCounts, [actorId]: count + 1 },
        buzzedAt: ctx.now,
      };
      if (game.settings.autoPauseOnBuzz) effects.push({ type: "pause" });
      break;
    }

    case "skip":
      if (!isGuesser) return fail("Du kannst gerade nicht überspringen", 403);
      if (round?.state !== "playing") return fail("Gerade läuft kein Song");
      if (round.skippedPlayers.includes(actorId)) return fail("Bereits übersprungen");
      game.round = { ...round, skippedPlayers: [...round.skippedPlayers, actorId] };
      break;

    case "hint":
      if (!isPicker) return fail("Nur der aktuelle Spieler darf Tipps geben", 403);
      if (round?.state !== "playing") return fail("Gerade läuft kein Song");
      if (!game.settings.hintsEnabled[action.field]) return fail("Dieser Tipp ist deaktiviert");
      game.round = { ...round, [HINT_FLAG[action.field]]: true };
      break;

    case "judge": {
      if (!isPicker) return fail("Nur der aktuelle Spieler darf bewerten", 403);
      if (round?.state !== "buzzed" || !round.buzzedBy) return fail("Niemand hat gebuzzert");
      const buzzer = round.buzzedBy;
      const buzzerName = game.players.find(p => p.id === buzzer)?.name;
      if (action.verdict === "correct") {
        game.scores[buzzer] = (game.scores[buzzer] ?? 0) + 1;
        if (round.songName) {
          (game.guessedSongs[buzzer] ??= []).push({
            songName: round.songName,
            artistName: round.artistName ?? "",
            albumArt: round.albumArt,
          });
        }
        game.lastResult = { type: "correct", byPlayerName: buzzerName, song: songOf(round) };
        if (game.settings.gameMode === "bestOf" && game.scores[buzzer] >= game.settings.bestOf) {
          game.status = "finished";
          game.round = undefined;
        } else {
          advanceTurn(game, ctx);
        }
      } else {
        game.lastResult = { type: "wrong", byPlayerName: buzzerName };
        game.round = { ...round, state: "playing", buzzedBy: undefined, wrongPlayers: [...round.wrongPlayers, buzzer] };
      }
      if (game.settings.autoPauseOnBuzz) effects.push({ type: "play" });
      break;
    }

    case "reveal":
      if (!isPicker) return fail("Nur der aktuelle Spieler darf auflösen", 403);
      if (round?.state !== "playing" && round?.state !== "buzzed") return fail("Gerade läuft kein Song");
      game.lastResult = { type: "revealed", song: songOf(round) };
      advanceTurn(game, ctx);
      break;

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
      game.round = undefined;
      game.lastResult = undefined;
      game.scores = Object.fromEntries(all.map(p => [p.id, 0]));
      game.guessedSongs = {};
      break;
    }

    case "play":
    case "pause":
    case "seek":
      if (!isPicker && !isHost) return fail("Nur der aktuelle Spieler darf die Wiedergabe steuern", 403);
      if (!isPlaying) return fail("Spiel läuft nicht");
      effects.push(action);
      break;
  }

  return { ok: true, game, effects };
}

// ── Input validation for untrusted request bodies ───────────────────────────

const str = (v: unknown, max = 500): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v: unknown) => (typeof v === "string" ? v.slice(0, 500) : undefined);

function parseTrack(v: unknown): Track | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  if (!str(t.id, 64) || !str(t.name) || typeof t.artist !== "string") return null;
  return {
    id: t.id, name: t.name, artist: t.artist.slice(0, 500),
    album: optStr(t.album), releaseYear: optStr(t.releaseYear),
    albumArt: optStr(t.albumArt) ?? null, previewUrl: optStr(t.previewUrl) ?? null,
  };
}

export function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== "object") return null;
  const a = body as Record<string, unknown>;
  switch (a.type) {
    case "start": case "buzz": case "skip": case "reveal": case "reset": case "pause":
      return { type: a.type };
    case "updateSettings":
      return a.patch && typeof a.patch === "object" ? { type: a.type, patch: a.patch as Partial<GameSettings> } : null;
    case "kick": case "toggleViewer":
      return str(a.playerId, 64) ? { type: a.type, playerId: a.playerId } : null;
    case "pickSong": {
      const track = parseTrack(a.track);
      return track ? { type: a.type, track } : null;
    }
    case "hint":
      return HINT_FIELDS.includes(a.field as HintField) ? { type: a.type, field: a.field as HintField } : null;
    case "judge":
      return a.verdict === "correct" || a.verdict === "wrong" ? { type: a.type, verdict: a.verdict } : null;
    case "play":
      return a.trackId === undefined ? { type: a.type } : str(a.trackId, 64) ? { type: a.type, trackId: a.trackId } : null;
    case "seek":
      return typeof a.positionMs === "number" && a.positionMs >= 0 ? { type: a.type, positionMs: Math.round(a.positionMs) } : null;
    default:
      return null;
  }
}
