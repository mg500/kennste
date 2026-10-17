import { normalizeTitle } from "./releaseYear";
import { BLOCK_STRIDE, fetchPlaylistItems, QUEUE_BLOCK, restorePlayer, scanPlaylistQueue, snapshotPlayer, waitForPlayer, type PlayerSnapshot } from "./playlists";
import { browseQuery } from "./browse";
import { deviceQuery, fetchDevices, fetchPlayerState, runEffect, sameTrack, searchTracks, spotifyFetch, transferPlayback } from "./spotify";
import type { Track } from "./game/types";

/** One check against the real Spotify: passed, failed, or skipped (null). */
export interface DiagnoseStep { name: string; ok: boolean | null; detail: string }

interface RawPlaylist { id: string; name: string; owner?: { id?: string }; items?: { total: number }; tracks?: { total: number } }

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
      const error = await runEffect(token, { type: "play", trackId: first.id }, deviceId);
      const isFirst = (p: PlayerSnapshot) => !!p.is_playing && !!p.item?.id && sameTrack(first.id, p.item.id, p.item.name);
      const started = await timed(() => waitForPlayer(token, isFirst));
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
        if (scan.error || !ordered || start < position) {
          step(name, false, scan.error ?? `Songs nicht in Playlist-Reihenfolge · ${list}`);
        } else if (start === position) {
          step(name, true, `${found.length} Songs in Playlist-Reihenfolge · ${list}`);
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
    }

    // ── Browsing by decade and genre (song search for players): Spotify's search filters ──
    const decade = await searchTracks(token, browseQuery({ decade: 1980 })!, 10, 0);
    const inDecade = decade.filter(t => { const y = Number(t.releaseYear?.slice(0, 4)); return y >= 1980 && y <= 1989; });
    const later = await searchTracks(token, browseQuery({ decade: 1980 })!, 10, 100);
    const repeated = later.filter(t => decade.some(u => u.id === t.id)).length;
    step("Songs nach Jahrzehnt suchen (80er)", decade.length === 10 && inDecade.length >= 9 && later.length > 0 && repeated === 0,
      `${decade.length} Songs, ${inDecade.length} davon aus den 80ern · ab Ergebnis 100: ${later.length} Songs, ${repeated} doppelt`
      + (decade.length ? ` · z. B. ${decade.slice(0, 3).map(t => `„${t.name}“ (${t.releaseYear ?? "?"})`).join(", ")}` : ""));
    const genre = await searchTracks(token, browseQuery({ decade: 1990, genre: "rock" })!, 10, 0);
    step("Songs nach Jahrzehnt und Genre suchen (90er · Rock)", genre.length > 0,
      genre.length ? `${genre.length} Songs, z. B. ${genre.slice(0, 3).map(t => `„${t.name}“ von ${t.artist}`).join(", ")}` : "Keine Treffer – der Genre-Filter greift so nicht");

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
      const read = async (position: number) => (await scanPlaylistQueue(token, found.id, [position], { deviceId, total: total(found) })).tracks;
      const a = await read(0);
      const b = await read(QUEUE_BLOCK);
      const overlap = a.filter(t => b.some(u => u.id === t.id)).length;
      step("Fremde Playlist blockweise lesen", a.length === QUEUE_BLOCK && b.length === QUEUE_BLOCK && overlap === 0,
        `Block 1: ${a.length} Songs, Block 2: ${b.length} Songs, ${overlap} doppelt`);
    }
  } finally {
    // Leave the player as it was
    await setShuffle(token, !!before?.shuffle_state, deviceId);
    if (before?.is_playing) await restorePlayer(token, before, deviceId);
    else await runEffect(token, { type: "pause" }, deviceId);
  }
  return steps;
}
