import { normalizeTitle } from "./releaseYear";
import { BLOCK_STRIDE, fetchPlaylistItems, QUEUE_BLOCK, restorePlayer, scanPlaylistQueue, searchPlaylistLength, snapshotPlayer, waitForPlayer, type PlayerSnapshot } from "./playlists";
import { browseQuery, GENRES } from "./browse";
import { CHECK_DELAYS_MS, deviceQuery, fetchDevices, fetchPlayerState, fetchRecentlyPlayed, runEffect, sameTrack, searchTracks, sleep, spotifyFetch, transferPlayback } from "./spotify";
import type { Track } from "./game/types";

/** Spotify genre names that might cover German music of the 80s, which "german pop" doesn't (see runDiagnosis). */
const GERMAN_CANDIDATES = ["neue deutsche welle", "german rock", "deutschrock", "deutschpop", "german new wave", "liedermacher"];

/** One check against the real Spotify: passed, failed, or skipped (null). */
export interface DiagnoseStep { name: string; ok: boolean | null; detail: string }

interface RawPlaylist { id: string; name: string; owner?: { id?: string }; items?: { total: number }; tracks?: { total: number } }

/** The one playlist the diagnosis saves songs to, reused on every run. */
const DIAGNOSE_PLAYLIST = "Kennste?! – Diagnose";

const total = (p: RawPlaylist) => p.items?.total ?? p.tracks?.total ?? 0;
const same = (a: Track, b: Track) => a.id === b.id || normalizeTitle(a.name) === normalizeTitle(b.name);

/** Each song's position in the playlist: by ID, else by title — the next match after the previous song. */
function playlistPositions(songs: Track[], items: Track[], from: number): number[] {
  let previous = from - 1;
  return songs.map(t => {
    let i = items.findIndex((item, k) => k > previous && item.id === t.id);
    if (i < 0) i = items.findIndex((item, k) => k > previous && same(item, t));
    if (i < 0) i = items.findIndex(item => same(item, t));
    if (i >= 0) previous = i;
    return i;
  });
}

/** Whether Spotify can play the playlist's songs at these positions in the user's market. */
async function playability(token: string, playlistId: string, offset: number, count: number) {
  type Entry = { item?: { name?: string; is_playable?: boolean }; track?: { name?: string; is_playable?: boolean } };
  const data = await getJson<{ items?: Entry[] }>(token, `/playlists/${playlistId}/items?offset=${offset}&limit=${Math.min(count, 10)}&market=from_token`);
  return (data?.items ?? []).map(e => {
    const t = e.item ?? e.track;
    return { name: t?.name ?? "?", playable: t?.is_playable };
  });
}

/** Songs started one after another like the rounds of a game, how long to wait for each, and how often to look. */
const SONG_STARTS = 10;
const START_WAIT_MS = 10_000;
const START_POLL_MS = 250;
/** How long the game asks Spotify whether a new song plays (see runEffect). */
const GAME_WAITS_MS = CHECK_DELAYS_MS.reduce((a, b) => a + b, 0);

const secs = (ms: number) => `${(ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s`;

/**
 * Starts songs one after another, each while the one before still plays – like the rounds of a game – and measures
 * when Spotify reports each one playing. Without the game's check, so a late report doesn't wake the device.
 */
async function measureSongStarts(token: string, songs: Track[], deviceId: string) {
  const reported: (number | undefined)[] = [];
  /** Spotify still reported the previous song playing after the new one was started. */
  let oldSong = 0;
  let previous: string | undefined;
  for (const song of songs) {
    const start = Date.now();
    const error = await runEffect(token, { type: "play", trackId: song.id }, deviceId, { checkDelaysMs: [] });
    if (error) return { error: `${error} (Song ${reported.length + 1})`, reported, oldSong };
    let at: number | undefined;
    let sawOld = false;
    for (let k = 0; k < START_WAIT_MS / START_POLL_MS && at === undefined; k++) {
      const p = await snapshotPlayer(token);
      const playing = p?.is_playing && p.item?.id ? p.item : undefined;
      if (playing && sameTrack(song.id, playing.id!, playing.name)) at = Date.now() - start;
      else if (playing && previous && sameTrack(previous, playing.id!, playing.name)) sawOld = true;
      if (at === undefined) await sleep(START_POLL_MS);
    }
    reported.push(at);
    if (sawOld) oldSong++;
    previous = song.id;
    await sleep(1000); // the song plays a moment, like a round
  }
  return { reported, oldSong };
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

async function timed<T>(run: () => Promise<T>): Promise<{ result: T; seconds: string }> {
  const start = Date.now();
  const result = await run();
  return { result, seconds: `${((Date.now() - start) / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s` };
}

async function getJson<T>(token: string, path: string): Promise<T | null> {
  const res = await spotifyFetch(token, path).catch(() => null);
  return res?.ok && res.status !== 204 ? res.json().catch(() => null) as Promise<T | null> : null;
}

type Volume = { device?: { volume_percent?: number | null; supports_volume?: boolean } | null };

const setVolume = (token: string, percent: number, deviceId: string) =>
  spotifyFetch(token, `/me/player/volume?volume_percent=${percent}${deviceQuery(deviceId, "&")}`, { method: "PUT" }).catch(() => null);

/** Sets the volume to 0 for two seconds and back, and tells what Spotify answered and reported. */
async function muteCheck(token: string, deviceId: string, step: (name: string, ok: boolean | null, detail: string) => unknown) {
  const name = "Stummschalten (Lautstärke 0) und zurück";
  const volumeOf = (p: Volume | null) => p?.device?.volume_percent;
  const start = await getJson<Volume>(token, "/me/player");
  const original = volumeOf(start);
  const supports = start?.device?.supports_volume;
  if (original === undefined || original === null) {
    step(name, null, `Spotify meldet keine Lautstärke${supports === false ? " (supports_volume: nein)" : ""}`);
    return;
  }
  const muteRes = await setVolume(token, 0, deviceId);
  const muted = await timed(() => waitForVolume(token, 0));
  await sleep(2000);
  const backRes = await setVolume(token, original, deviceId);
  const back = await timed(() => waitForVolume(token, original));
  const status = (res: Response | null) => (res ? String(res.status) : "keine Antwort");
  const okMute = !!muteRes?.ok && volumeOf(muted.result) === 0;
  const okBack = volumeOf(back.result) === original;
  step(name, okMute && okBack,
    `Vorher ${original} %, supports_volume: ${supports === undefined ? "?" : supports ? "ja" : "nein"}`
    + ` · auf 0: Status ${status(muteRes)}, ${volumeOf(muted.result) === 0 ? `gemeldet nach ${muted.seconds}` : `gemeldet ${volumeOf(muted.result) ?? "?"} %`}`
    + ` · zurück: Status ${status(backRes)}, ${okBack ? `gemeldet nach ${back.seconds}` : `gemeldet ${volumeOf(back.result) ?? "?"} %`}`
    + " · Bitte hinhören: war es 2 s lang still?");
  // Never leave the device quiet
  if (!okBack) await setVolume(token, original, deviceId);
}

/** Polls the player until it reports `percent` (or 3 s are up). */
async function waitForVolume(token: string, percent: number): Promise<Volume | null> {
  let state: Volume | null = null;
  for (let waited = 0; waited <= 3000; waited += 250) {
    state = await getJson<Volume>(token, "/me/player");
    if (state?.device?.volume_percent === percent) return state;
    await sleep(250);
  }
  return state;
}

const setShuffle = (token: string, on: boolean, deviceId: string) =>
  spotifyFetch(token, `/me/player/shuffle?state=${on}${deviceQuery(deviceId, "&")}`, { method: "PUT" }).catch(() => null);

/**
 * Checks what the game assumes about Spotify, with the user's account and device (see "Noch nie mit echtem
 * Spotify getestet" in AGENTS.md). Plays music on the device for a moment and restores the state afterwards.
 */
export async function runDiagnosis(token: string, opts: { deviceId?: string } = {}): Promise<DiagnoseStep[]> {
  const steps: DiagnoseStep[] = [];
  const step = (name: string, ok: boolean | null, detail: string) => { steps.push({ name, ok, detail }); return ok; };

  const me = await getJson<{ id: string; display_name?: string }>(token, "/me");
  if (!step("Spotify-Konto", !!me, me ? `Angemeldet als ${me.display_name ?? me.id}` : "Spotify nicht erreichbar oder Anmeldung abgelaufen")) return steps;

  // Suggestions for the test song before a game (Musik einrichten): needs `user-read-recently-played`
  const raw = await getJson<{ items?: unknown[] }>(token, "/me/player/recently-played?limit=20");
  const recent = await fetchRecentlyPlayed(token);
  step("Zuletzt gehörte Songs lesen", !!recent && "tracks" in recent,
    !recent ? "Spotify nicht erreichbar"
    : "status" in recent ? `Spotify antwortet ${recent.status}${recent.status === 403 || recent.status === 401 ? " – einmal ab- und wieder anmelden, damit die neue Berechtigung gilt" : ""}`
    : `${raw?.items?.length ?? "?"} Einträge, ${recent.tracks.length} verschiedene Songs`
      + `${recent.tracks.length ? ` · mit Cover: ${recent.tracks.filter(t => t.albumArt).length}` : ""}`
      + `${recent.tracks.length ? ` · zuletzt: ${recent.tracks.slice(0, 3).map(t => `„${t.name}“`).join(", ")}` : ""}`);

  const [state, devices] = await Promise.all([fetchPlayerState(token), fetchDevices(token)]);
  const device = opts.deviceId
    ? devices?.find(d => d.id === opts.deviceId)
    : state?.device ?? devices?.find(d => d.isActive) ?? devices?.find(d => !d.isRestricted);
  if (!step("Wiedergabegerät", !!device && !device.isRestricted, !device
    ? (opts.deviceId ? "Das gewählte Gerät ist nicht mehr da – öffne dort Spotify" : "Kein Gerät – öffne Spotify auf einem Gerät und spiel kurz etwas ab")
    : device.isRestricted ? `${device.name} lässt sich von Spotify aus nicht fernsteuern`
    : `${device.name} (${device.type})${devices ? ` · ${devices.length} Gerät(e) gefunden` : ""}`)) return steps;
  const deviceId = device!.id;
  const before = await snapshotPlayer(token);

  // Music on another device: move it to the picked one first, like the game does when a device is picked
  if (state?.device && state.device.id !== deviceId) {
    const error = await transferPlayback(token, deviceId);
    const moved = await timed(() => waitForPlayer(token, p => p.device?.id === deviceId, 5000));
    if (!step("Wiedergabe aufs Gerät übertragen", !error && moved.result?.device?.id === deviceId,
      error ?? (moved.result?.device?.id === deviceId ? `Übernommen nach ${moved.seconds}` : "Das Gerät reagiert nicht – öffne dort Spotify"))) return steps;
  }

  try {
    // ── Own playlist: songs readable, so everything can be compared exactly ──
    const mine = (await getJson<{ items?: RawPlaylist[] }>(token, "/me/playlists?limit=50"))?.items
      ?.filter(p => p?.owner?.id === me!.id && total(p) > 0)
      .sort((a, b) => total(b) - total(a)) ?? [];
    const own = mine[0];
    step("Eigene Playlists", own ? true : null, own ? `${mine.length} gefunden, geprüft wird „${own.name}“ (${total(own)} Songs)` : "Keine eigene Playlist mit Songs – leg eine an, um mehr zu prüfen");

    let items: Track[] = [];
    if (own) {
      items = await fetchPlaylistItems(token, own.id);
      step("Songs einer eigenen Playlist lesen", items.length > 0, `${items.length} von ${total(own)} Songs gelesen`);
    }

    const first = items[0];
    if (first) {
      // Without the game's check (it waits itself until Spotify reports the song), so the time below is the real one
      const error = await runEffect(token, { type: "play", trackId: first.id }, deviceId, { checkDelaysMs: [] });
      const isFirst = (p: PlayerSnapshot) => !!p.is_playing && !!p.item?.id && sameTrack(first.id, p.item.id, p.item.name);
      const started = await timed(() => waitForPlayer(token, isFirst, START_WAIT_MS));
      const playing = !!started.result && isFirst(started.result);
      // Round timers and the buzzer's snippet length start once Spotify reports the song: how long that takes
      step("Song über sein Album starten", !error && playing, error ?? (playing
        ? `„${started.result!.item!.name}“ läuft${started.result!.item!.id !== first.id ? " (andere Fassung)" : ""}, gemeldet nach ${started.seconds}`
        : `Spotify meldet stattdessen: ${started.result?.item?.name ?? "nichts"}`));

      // Random start: the song is started via its album at a position, like playEffect does
      const at = Math.min(60_000, Math.round((first.durationMs ?? 120_000) / 2));
      const positionError = await runEffect(token, { type: "play", trackId: first.id, positionMs: at }, deviceId);
      const jumped = await waitForPlayer(token, p => isFirst(p) && (p.progress_ms ?? 0) >= at - 2000);
      const progress = jumped?.progress_ms ?? 0;
      step("Song an bestimmter Stelle starten (zufällige Startstelle)", !positionError && !!jumped && isFirst(jumped) && progress >= at - 2000,
        positionError ?? `Angefordert ${clock(at)}, Spotify spielt bei ${clock(progress)}`);

      // Spotify reports the new state only a moment later: how long it takes is worth knowing
      await runEffect(token, { type: "pause" }, deviceId);
      const paused = await timed(() => waitForPlayer(token, p => p.is_playing === false));
      await runEffect(token, { type: "play" }, deviceId);
      const resumed = await timed(() => waitForPlayer(token, p => p.is_playing === true));
      const okPause = paused.result?.is_playing === false;
      const okResume = resumed.result?.is_playing === true;
      step("Pausieren und fortsetzen", okPause && okResume,
        `Pause ${okPause ? `✓ (gemeldet nach ${paused.seconds})` : "✗"} · Fortsetzen ${okResume ? `✓ (gemeldet nach ${resumed.seconds})` : "✗"}`);

      // Muting while a playlist is read through the queue (it plays for a moment): does the device let the
      // volume be set, how soon does Spotify report it – and is it set back? Listen: was it quiet for a moment?
      await muteCheck(token, deviceId, step);

      // Reading the queue, once with shuffle off and once on: the game must turn it off, read the right block
      // and restore everything
      const position = items.length > QUEUE_BLOCK ? QUEUE_BLOCK : 0;
      for (const shuffle of [false, true]) {
        const name = `Warteschlange ab Position ${position} lesen (Shuffle ${shuffle ? "an" : "aus"})`;
        await setShuffle(token, shuffle, deviceId);
        await waitForPlayer(token, p => p.shuffle_state === shuffle);
        const scan = await scanPlaylistQueue(token, own!.id, [position], { deviceId, total: items.length, restore: true });
        // Where in the playlist the songs came from tells a shifted start from shuffling (scattered)
        const found = playlistPositions(scan.tracks, items, position);
        const inOrder = found.filter((p, k) => k > 0 && p >= 0 && p === found[k - 1] + 1).length;
        const ordered = found.length > 1 && inOrder >= Math.floor((found.length - 1) * 0.9);
        const start = found[0] ?? -1;
        const list = `Positionen in der Playlist: ${found.slice(0, 8).map(p => (p < 0 ? "?" : p)).join(", ")}${found.length > 8 ? ", …" : ""}`;
        // A whole block, or songs between two blocks are never read in the game
        const expected = Math.min(QUEUE_BLOCK, items.length - position - 1);
        const late = scan.reads > 1 ? ` · vollständig erst beim ${scan.reads}. Lesen` : "";
        if (scan.error || !ordered || start < position) {
          step(name, false, scan.error ?? `Songs nicht in Playlist-Reihenfolge · ${list}`);
        } else if (found.length < expected) {
          step(name, false, `Nur ${found.length} von ${expected} Songs, auch nach ${scan.reads}× Lesen – zwischen zwei Blöcken gingen Songs verloren · ${list}`);
        } else if (start === position) {
          step(name, true, `${found.length} Songs in Playlist-Reihenfolge${late} · ${list}`);
        } else {
          // Spotify started later. Skipping songs it can't play is harmless, and one song late is evened out by
          // the overlapping blocks (BLOCK_STRIDE) — more would lose songs when loading
          const skipped = await playability(token, own!.id, position, start - position);
          const playable = skipped.filter(s => s.playable !== false);
          step(name, playable.length <= QUEUE_BLOCK - BLOCK_STRIDE,
            `Spotify beginnt bei Position ${start} statt ${position}${playable.length === 1 ? " (gleicht die App aus)" : ""} – übersprungen: `
            + `${skipped.map(s => `„${s.name}“ (${s.playable === false ? "nicht abspielbar" : s.playable ? "abspielbar" : "Abspielbarkeit unbekannt"})`).join(", ")} · ${list}`);
        }
      }

      const after = await waitForPlayer(token, p => p.shuffle_state === true);
      step("Shuffle danach wieder an", after?.shuffle_state === true, after ? `Shuffle ist ${after.shuffle_state ? "an" : "aus"}` : "Player nicht lesbar");
      const back = await waitForPlayer(token, isFirst);
      const continued = !!back && isFirst(back);
      step("Vorherige Musik läuft danach weiter", continued, continued
        ? `„${back!.item!.name}“ läuft weiter`
        : `Es läuft: ${back?.item?.name ?? "nichts"}${back?.is_playing ? "" : " (pausiert)"}`);

      // A Google TV stick reported new songs during a game often only after more than 2 s, sometimes not within
      // the game's wait at all (Nov 2026) – one start alone hardly shows that
      const songs = items.slice(1, 1 + SONG_STARTS);
      const name = `${SONG_STARTS} Songs nacheinander starten`;
      if (songs.length < 2) {
        step(name, null, "Die Playlist hat zu wenige Songs");
      } else {
        const run = await measureSongStarts(token, songs, deviceId);
        const times = run.reported.filter((ms): ms is number => ms !== undefined);
        const sorted = [...times].sort((a, b) => a - b);
        const missing = run.reported.length - times.length;
        const tooLate = times.filter(ms => ms > GAME_WAITS_MS).length;
        step(name, !run.error && !missing && !tooLate, [
          ...(run.error ? [run.error] : []),
          `${times.length} von ${run.reported.length} gemeldet`
            + (sorted.length ? ` · meist nach ${secs(sorted[Math.floor(sorted.length / 2)])}, längstens nach ${secs(sorted.at(-1)!)}` : ""),
          `über 2 s: ${times.filter(ms => ms > 2000).length}`,
          ...(missing || tooLate ? [`nach mehr als ${secs(GAME_WAITS_MS)} oder nie: ${missing + tooLate}`] : []),
          ...(run.oldSong ? [`vorher noch der alte Song gemeldet: ${run.oldSong}×`] : []),
          `einzeln: ${run.reported.map(ms => (ms === undefined ? "–" : secs(ms))).join(" · ")}`,
        ].join(" · "));
      }
    }

    // ── Browsing by decade and genre (song search for players): Spotify's search filters ──
    // Spotify may return fewer songs per page than asked for (5 of 10 for a search by year alone, seen Oct 2026):
    // the app pages on until a page is empty. What counts: the filter works and further pages bring new songs
    const eighties = browseQuery({ decade: 1980 })!;
    const raw = await getJson<{ tracks?: { items?: unknown[]; total?: number } }>(token, `/search?q=${encodeURIComponent(eighties)}&type=track&limit=10`);
    const decade = await searchTracks(token, eighties, 10, 0);
    const inDecade = decade.filter(t => { const y = Number(t.releaseYear?.slice(0, 4)); return y >= 1980 && y <= 1989; });
    const later = await searchTracks(token, eighties, 10, 100);
    const repeated = later.filter(t => decade.some(u => u.id === t.id)).length;
    step("Songs nach Jahrzehnt suchen (80er)", decade.length > 0 && inDecade.length >= Math.ceil(decade.length * 0.9) && later.length > 0 && repeated === 0,
      `${decade.length} Songs, ${inDecade.length} davon aus den 80ern · ab Ergebnis 100: ${later.length} Songs, ${repeated} doppelt`
      + ` · Spotify liefert pro Seite ${raw?.tracks?.items?.length ?? "?"} von 10 angefragten (insgesamt ${raw?.tracks?.total ?? "?"} gemeldet)`
      + (decade.length ? ` · z. B. ${decade.slice(0, 3).map(t => `„${t.name}“ (${t.releaseYear ?? "?"})`).join(", ")}` : ""));
    // Every genre of the song browser, alone and with a decade: Spotify's genre names have to match
    const genres = await Promise.all(GENRES.map(async g => ({
      label: g.label,
      alone: (await searchTracks(token, browseQuery({ genre: g.id })!, 10, 0)).length,
      eighties: (await searchTracks(token, browseQuery({ decade: 1980, genre: g.id })!, 10, 0)).length,
    })));
    const empty = genres.filter(g => !g.alone).map(g => g.label);
    // "Deutsch" (german pop) finds nothing from the 80s (seen Oct 2026): which genre names Spotify uses there
    const german = await Promise.all(GERMAN_CANDIDATES.map(async name => ({
      name,
      alone: (await searchTracks(token, `genre:"${name}"`, 10, 0)).length,
      eighties: (await searchTracks(token, `${browseQuery({ decade: 1980 })} genre:"${name}"`, 10, 0)).length,
    })));
    step("Genres beim Stöbern", empty.length === 0,
      (empty.length ? `Keine Treffer für ${empty.join(", ")} – der Genre-Name passt so nicht · ` : "")
      + `Treffer allein / mit den 80ern: ${genres.map(g => `${g.label} ${g.alone}/${g.eighties}`).join(" · ")}`);
    step("Deutsche Musik der 80er (andere Genre-Namen)", german.some(g => g.eighties > 0),
      `Treffer allein / mit den 80ern: ${german.map(g => `„${g.name}“ ${g.alone}/${g.eighties}`).join(" · ")}`);

    // ── Saving the songs of a game as a playlist (end screen): reuses one test playlist, so none pile up ──
    const song = decade[0];
    if (!song) {
      step("Songs als Playlist speichern", null, "Kein Song zum Testen gefunden");
    } else {
      const existing = mine.find(p => p.name === DIAGNOSE_PLAYLIST)
        ?? (await getJson<{ items?: RawPlaylist[] }>(token, "/me/playlists?limit=50"))?.items?.find(p => p?.owner?.id === me!.id && p.name === DIAGNOSE_PLAYLIST);
      let playlistId = existing?.id;
      let detail = "";
      if (!playlistId) {
        const created = await spotifyFetch(token, "/me/playlists", {
          method: "POST", body: JSON.stringify({ name: DIAGNOSE_PLAYLIST, description: "Test der Kennste?!-Diagnose, kann gelöscht werden", public: false }),
        }).catch(() => null);
        playlistId = created?.ok ? (await created.json().catch(() => null) as { id?: string } | null)?.id : undefined;
        detail = playlistId ? "Angelegt" : `Anlegen fehlgeschlagen (${created?.status ?? "keine Antwort"}${created?.status === 403 ? " – neu anmelden, damit die Berechtigung gilt" : ""})`;
      } else {
        detail = "Vorhandene Test-Playlist genutzt";
      }
      if (playlistId) {
        const added = await spotifyFetch(token, `/playlists/${playlistId}/items`, { method: "POST", body: JSON.stringify({ uris: [`spotify:track:${song.id}`] }) }).catch(() => null);
        const content = await fetchPlaylistItems(token, playlistId);
        const ok = !!added?.ok && content.some(t => t.id === song.id);
        step("Songs als Playlist speichern", ok, `${detail} · „${song.name}“ ${ok ? "hinzugefügt und gelesen" : `nicht hinzugefügt (${added?.status ?? "keine Antwort"})`} · „${DIAGNOSE_PLAYLIST}“ in Spotify löschen, wenn du magst`);
      } else {
        step("Songs als Playlist speichern", false, detail);
      }
    }

    // ── Foreign playlist: only readable through the queue ──
    const found = (await getJson<{ playlists?: { items?: (RawPlaylist | null)[] } }>(token, "/search?q=hits&type=playlist&limit=10"))
      ?.playlists?.items?.find(p => p && p.owner?.id !== me!.id && total(p) > 2 * QUEUE_BLOCK);
    if (!found) {
      step("Fremde Playlist", null, "Keine passende Playlist gefunden");
    } else {
      const readable = await fetchPlaylistItems(token, found.id);
      step("Fremde Playlist direkt lesen", true, readable.length
        ? `${readable.length} Songs lesbar (unerwartet – Development Mode aufgehoben?)`
        : `„${found.name}“ ist wie erwartet nicht direkt lesbar – die App nutzt die Warteschlange`);
      // Without a length the game reads just one block (21 songs). Spotify tells it only in the search (Nov 2026):
      // picked there, the lobby sends it along; for a pasted link the server looks the playlist up by its name
      const direct = await getJson<RawPlaylist>(token, `/playlists/${found.id}`);
      const byName = await searchPlaylistLength(token, found.id, found.name);
      step("Länge einer fremden Playlist lesen", byName > 0,
        `${total(found)} Songs laut Suche · per Name gesucht (für Links): ${byName ? `${byName} Songs` : "nicht unter den ersten 10 Treffern"}`
          + ` · direkt abgefragt: ${!direct ? "nicht abrufbar" : total(direct) ? `${total(direct)} Songs (neu – Spotify nennt die Länge wieder)` : "keine Anzahl"}`);
      const read = (position: number) => scanPlaylistQueue(token, found.id, [position], { deviceId, total: total(found) });
      const a = await read(0);
      const b = await read(QUEUE_BLOCK);
      const overlap = a.tracks.filter(t => b.tracks.some(u => u.id === t.id)).length;
      const reads = Math.max(a.reads, b.reads);
      step("Fremde Playlist blockweise lesen", a.tracks.length === QUEUE_BLOCK && b.tracks.length === QUEUE_BLOCK && overlap === 0,
        `Block 1: ${a.tracks.length} Songs, Block 2: ${b.tracks.length} Songs, ${overlap} doppelt`
        + (reads > 1 ? ` · Warteschlange vollständig erst beim ${reads}. Lesen` : ""));

      // A playlist of unknown length could be read block by block until its end – if Spotify shows where that is
      const contextUri = `spotify:playlist:${found.id}`;
      const past = total(found) + 5;
      const res = await spotifyFetch(token, `/me/player/play${deviceQuery(deviceId)}`, {
        method: "PUT", body: JSON.stringify({ context_uri: contextUri, offset: { position: past } }),
      }).catch(() => null);
      const now = res?.ok ? await waitForPlayer(token, p => p.context?.uri === contextUri, 2000) : null;
      if (res?.ok) await runEffect(token, { type: "pause" }, deviceId);
      const playing = now?.context?.uri === contextUri ? now.item : undefined;
      step("Fremde Playlist hinter dem Ende starten", !!res, !res ? "Spotify nicht erreichbar"
        : `Position ${past + 1} von ${total(found)}: Spotify antwortet ${res.status}`
          + (!res.ok ? "" : playing ? ` · spielt „${playing.name}“${playing.id === a.tracks[0]?.id ? " (den ersten Song)" : ""}` : " · Playlist läuft nicht"));
    }
  } finally {
    // Leave the player as it was
    await setShuffle(token, !!before?.shuffle_state, deviceId);
    if (before?.is_playing) await restorePlayer(token, before, deviceId);
    else await runEffect(token, { type: "pause" }, deviceId);
  }
  return steps;
}
