# Verified on real Spotify?

What the app expects from Spotify is covered by unit and render tests, by scenarios against the Spotify simulator (`src/test/spotifySim.ts`) and by screenshots – but the simulator only knows what was observed on the real Spotify. This list tracks what has been checked with the diagnosis (`/diagnose`, see [development.md](development.md#commands)) or in a real game, and what hasn't been seen yet.

When something goes wrong in a real game, run `/diagnose` first (playing, starting position, playlists, queue, shuffle – with your own account, on a device of your choice) and look here; most of it lives in `src/lib/game/store.ts` (`pollPlayback`, `resumeIfLoaded`).

## Playing

- **Songs are started through their album** (see “Notes on the Spotify API” in [development.md](development.md#notes-on-the-spotify-api)): confirmed by the diagnosis on a Mac and a Pixel 9 (Android, Oct 2026). Not seen in a game yet – nor whether the timers kick in when another version of the song plays (`sameTrack`).
- **Random starting point** in the buzzer quiz (`position_ms` when playing through the album): confirmed by the diagnosis on a Mac and a Pixel 9 (1:00 requested, 1:01 played). Not seen in a game yet.
- **Timers only start once the song really plays** (`onPlaying`): not seen yet.
- **Pause/play resumes** instead of starting over: not seen yet.
- **A new round's song always starts from the beginning**, even if it's loaded already (`noteLobbySong`; `resumeIfLoaded` only for the play button), and what plays at the start comes last in the game: simulator only.
- **Pause at the end of a song** (Nov 2026, `watchSongEnd` in `store.ts`): pauses 0.7 s before the end so the album doesn't play on, or once Spotify moved on right after the end (log `songEnded`). Simulator only – whether the pause arrives in time on a Mac or phone hasn't been seen.
- **Autoplay** in playlist mode and in the timeline: not seen yet.
- **Picking the playback device** (`/api/game/[id]/devices`: device list, transfer via `PUT /me/player`, `device_id` on every play; idle devices are woken by a transfer, plus 2 retries in `runEffect`; after playing, `ensurePlaying` checks for up to 5 s that the song really plays, otherwise transfers with `play: true` and plays again; 403 on pause/resume counts as “done already”): seen in a game on a Google TV stick (Nov 2026, server log): Spotify reported the new song often only after more than 2 s, the check (then 2 s) woke the device although the song played, and the transfer played the previous round's song for a moment. Whether 5 s are enough there, and whether a transfer with `play: true` always resumes the old song, hasn't been seen yet.

## Playlists

- **Reading foreign playlists through the queue**: queue from a position, shuffle off and back on, and resuming the previous music confirmed by the diagnosis on a Mac (the Mac starts one song late, shuffle and play/pause take effect late – all of it modeled in the simulator and handled). On a Pixel 9 (Oct 2026) the diagnosis reads the queue in playlist order with and without shuffle, and two blocks without duplicates – but in a second run once only 4 instead of 21 songs; since then the app reads up to 4 times (`QUEUE_READS`), and the next run was complete right away. Whether reading again is enough when it happens for real hasn't been seen (“complete only on read N”).
- **Loading more during a game** (`loadMoreSongs` before the start and before “Weiter”): not seen yet.
- **Length of foreign playlists**: Spotify only tells it in the search (diagnosis, Nov 2026; before that only 21 songs per playlist were read). The lobby sends it along, for a pasted link the server searches by the playlist's name – not seen in a game yet.
- **Picking a playlist starts it in the lobby** (foreign ones from the block read last, or where reading stopped for a short playlist or an unknown length; own ones from a random song, `playPlaylist`; errors playing on are logged as `playlistPlayOn`); songs heard in the lobby come last in the game (`heardLast`). Since Nov 2026 picking is done once the songs are read, switching shuffle back on and playing on follow (`settlePlaylist`; the start and lobby music wait for it): simulator only.
- **Countdown to the start**: songs are read and years checked during the 3 s; if it takes longer, the start waits with “Musik wird vorbereitet …” (`prepareStart`), started by a server timer: simulator only.
- **Lobby music** (`/api/game/[id]/music`, playlist via `context_uri`) and the playback state with title in the lobby (`pollLobbyPlayback`): not seen yet.
- **Music plays on in the lobby** (Nov 2026, `continueInLobby` in `store.ts`): after cancelling or the end of a game, the playing song plays to its end, then the playlist takes over (instead of the album); with nothing playing it starts right away: simulator only.
- **Saving played songs as a playlist** (lobby, `createPlaylist`/`addToPlaylist` in `src/lib/spotify.ts`; later games go into the same playlist: `POST /me/playlists`, `POST /playlists/{id}/items`, scope `playlist-modify-private`): creating and adding confirmed by the diagnosis (Oct 2026, reuses the test playlist “Kennste?! – Diagnose”); saving and adding in a game not seen yet. Hosts who logged in before the new scope have to log out and in once.

## Search and browsing

- **Browsing by decade and genre** (`year:`/`genre:` filters, `src/lib/browse.ts`): diagnosis (Oct 2026): the decade filter works but returns only 5 instead of 10 songs per page (modeled in the simulator, `yearOnlySearchPage`; browsing pages on until a page is empty), 90s + rock returns 10. Every genre (`GENRES`) returns 10 alone and with the 80s – except German (`german pop`: 0) and hip-hop (8). Which genre name finds German music of the 80s, the diagnosis checks (“Deutsche Musik der 80er”, candidates in `GERMAN_CANDIDATES`); adjust `GENRES` afterwards.
- **Recently played songs as suggestions for the test song** (Nov 2026, `fetchRecentlyPlayed` in `src/lib/spotify.ts`, `GET /me/player/recently-played`, scope `user-read-recently-played`): reading confirmed by the diagnosis on a Mac (Nov 2026: 20 entries, all with a cover); the suggestions under “Testsong abspielen” (search route without a query) not seen in a real game yet. Hosts who logged in before the new scope have to log out and in once.

## Access and setup

- **Refreshing the Spotify access after 1 h** (`getHostToken`): simulator only – play one game for longer than an hour on purpose.
- **Setting up music** (`/setup`): skipped on the start page, taking the music along when switching devices, test song, the device carried over into the new game: not seen yet.

## Devices and screens

- **Connecting a real TV browser**: scaling with CSS `zoom` to 1920×1080 (`useTvScale` – older TV browsers without `zoom` would scroll again), polling every 2 s, the remote's number keys, scanning the QR code with the phone camera opens `/tv/pair/<code>` in the browser the host is logged in with: not seen yet.
- **Continuing by majority and vibration on a real phone** (fixed continue button, `navigator.vibrate` only on Android): not seen yet.
- **Like an app on the phone** (swiping and the back gesture for menus, home screen icon, full screen): only tested in Chromium (Playwright) and happy-dom, not on a real iPhone or Android.
- **Stage light in the cover's color** (Nov 2026, `coverColor.ts`, `updateStageColor` in `store.ts`): loading covers from `i.scdn.co` and decoding them with `jpeg-js` only tested against the simulator (single-color JPEGs); whether real covers (progressive JPEGs?) decode and the color arrives in time for the round hasn't been seen.
