import { normalizeTitle } from "./releaseYear";
import { fetchPlaylistItems, QUEUE_BLOCK, restorePlayer, scanPlaylistQueue, snapshotPlayer, waitForPlayer, type PlayerSnapshot } from "./playlists";
import { deviceQuery, fetchDevices, fetchPlayerState, runEffect, sameTrack, spotifyFetch } from "./spotify";
import type { Track } from "./game/types";

/** One check against the real Spotify: passed, failed, or skipped (null). */
export interface DiagnoseStep { name: string; ok: boolean | null; detail: string }

interface RawPlaylist { id: string; name: string; owner?: { id?: string }; items?: { total: number }; tracks?: { total: number } }

const total = (p: RawPlaylist) => p.items?.total ?? p.tracks?.total ?? 0;
const same = (a: Track, b: Track) => a.id === b.id || normalizeTitle(a.name) === normalizeTitle(b.name);

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
export async function runDiagnosis(token: string): Promise<DiagnoseStep[]> {
  const steps: DiagnoseStep[] = [];
  const step = (name: string, ok: boolean | null, detail: string) => { steps.push({ name, ok, detail }); return ok; };

  const me = await getJson<{ id: string; display_name?: string }>(token, "/me");
  if (!step("Spotify-Konto", !!me, me ? `Angemeldet als ${me.display_name ?? me.id}` : "Spotify nicht erreichbar oder Anmeldung abgelaufen")) return steps;

  const [state, devices] = await Promise.all([fetchPlayerState(token), fetchDevices(token)]);
  const device = state?.device ?? devices?.find(d => d.isActive) ?? devices?.find(d => !d.isRestricted);
  if (!step("Wiedergabegerät", !!device, device
    ? `${device.name} (${device.type})${devices ? ` · ${devices.length} Gerät(e) gefunden` : ""}`
    : "Kein Gerät – öffne Spotify auf einem Gerät und spiel kurz etwas ab")) return steps;
  const deviceId = device!.id;
  const before = await snapshotPlayer(token);

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
      step("Song über sein Album starten", !error && playing, error ?? (playing
        ? `„${started.result!.item!.name}“ läuft${started.result!.item!.id !== first.id ? " (andere Fassung)" : ""}`
        : `Spotify meldet stattdessen: ${started.result?.item?.name ?? "nichts"}`));

      // Spotify reports the new state only a moment later: how long it takes is worth knowing
      await runEffect(token, { type: "pause" }, deviceId);
      const paused = await timed(() => waitForPlayer(token, p => p.is_playing === false));
      await runEffect(token, { type: "play" }, deviceId);
      const resumed = await timed(() => waitForPlayer(token, p => p.is_playing === true));
      const okPause = paused.result?.is_playing === false;
      const okResume = resumed.result?.is_playing === true;
      step("Pausieren und fortsetzen", okPause && okResume,
        `Pause ${okPause ? `✓ (gemeldet nach ${paused.seconds})` : "✗"} · Fortsetzen ${okResume ? `✓ (gemeldet nach ${resumed.seconds})` : "✗"}`);

      // Reading the queue with shuffle on: the game must turn it off, read the right block and restore everything
      const position = items.length > QUEUE_BLOCK ? QUEUE_BLOCK : 0;
      const expected = items.slice(position, position + QUEUE_BLOCK);
      await setShuffle(token, true, deviceId);
      await waitForPlayer(token, p => p.shuffle_state === true);
      const scan = await scanPlaylistQueue(token, own!.id, [position], { deviceId, total: items.length, restore: true });
      const matching = scan.tracks.filter((t, i) => expected[i] && same(t, expected[i])).length;
      // Where in the playlist the songs came from tells offset problems (shifted) from shuffling (scattered)
      const found = scan.tracks.slice(0, 8).map(t => items.findIndex(i => same(i, t))).map(i => (i < 0 ? "?" : String(i))).join(", ");
      step(`Warteschlange ab Position ${position} lesen`, matching >= Math.ceil(expected.length * 0.9), scan.error ??
        `${matching} von ${expected.length} Songs in der richtigen Reihenfolge · Positionen in der Playlist: ${found}${scan.tracks.length > 8 ? ", …" : ""}`);

      const after = await waitForPlayer(token, p => p.shuffle_state === true);
      step("Shuffle danach wieder an", after?.shuffle_state === true, after ? `Shuffle ist ${after.shuffle_state ? "an" : "aus"}` : "Player nicht lesbar");
      const back = await waitForPlayer(token, isFirst);
      const continued = !!back && isFirst(back);
      step("Vorherige Musik läuft danach weiter", continued, continued
        ? `„${back!.item!.name}“ läuft weiter`
        : `Es läuft: ${back?.item?.name ?? "nichts"}${back?.is_playing ? "" : " (pausiert)"}`);
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
