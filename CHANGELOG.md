# Changelog

## [0.2.0](https://github.com/mg500/kennste/compare/v0.1.0...v0.2.0) (2026-11-18)


### Features

* a picked playlist shows right away and is prepared in the lobby; the countdown really starts the game ([#12](https://github.com/mg500/kennste/issues/12)) ([76e3694](https://github.com/mg500/kennste/commit/76e3694658d0dcfeaa94d79ac455622cbd1f8c2f))
* after the reveal, phones can open the song in Spotify ([#10](https://github.com/mg500/kennste/issues/10)) ([57f967a](https://github.com/mg500/kennste/commit/57f967a40b4ac4f2c717a5748038db45c07ac471))
* points count up in place after a round instead of a full-screen pop ([#13](https://github.com/mg500/kennste/issues/13)) ([b34532b](https://github.com/mg500/kennste/commit/b34532b305ea50c70ef76a9fe75e4812a02ce44b))
* shorter texts in the rules, music setup and round hints ([#14](https://github.com/mg500/kennste/issues/14)) ([7eb3ed9](https://github.com/mg500/kennste/commit/7eb3ed9f4157a2f8d6d8a9de9ff8bca4b6960bf7))
* the app icons show the flat logo tile; README images show the current screens ([#16](https://github.com/mg500/kennste/issues/16)) ([9ec486e](https://github.com/mg500/kennste/commit/9ec486e55aff533d63fee72719561ad9a2c1d767))


### Bug Fixes

* songs start without the previous round's song, and played songs are fresh again after a day ([#8](https://github.com/mg500/kennste/issues/8)) ([e5319da](https://github.com/mg500/kennste/commit/e5319da2b24781f5ad527a2d1fd1bbdbf8b2fe5a))
* the bottom bar spans the full width between phone and laptop layout ([#15](https://github.com/mg500/kennste/issues/15)) ([dfad47c](https://github.com/mg500/kennste/commit/dfad47c01f27b75473834b3529657e3d7f18e793))

## 0.1.0 (2026-11-12)

First public release.

- Four games for a group in one room, with phones as buzzers: Buzzer (taking turns or everyone vs. everyone), Timeline (on your own, as a team or all at once), Guess the year and Four answers
- Join by QR code or game code – no app, no account; an optional TV view, paired without typing
- Songs from a playlist or picked by the players (search, or browse by decade and genre); release years from MusicBrainz
- A number of rounds or first to N points, hints, time limits and a bonus for the fastest
- A podium, awards and all songs at the end – save them as a Spotify playlist
- Three styles: Bühne, Dunkel and Hell
- Self-hosted as a single Docker container (amd64 and arm64), signed with cosign
