"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gameApi, type Credentials, type GameApi } from "./client";
import { syncClock } from "./clock";
import type { Action, Game, Playback, StreamEvent } from "./types";

export interface ReceivedPlayback { data: Playback; receivedAt: number }

/** What game components need to read and change the game. */
export interface GameControls {
  api: GameApi;
  act: (action: Action) => Promise<void>;
  applyGame: (game: Game) => void;
}

const NOTICE_MS = 4000;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15_000;
/** How long an action waits at most for the one before it. */
const ACTION_WAIT_MS = 3000;

/**
 * Live connection to a game: subscribes to the server's event stream and exposes actions for the
 * given player. Works without credentials too (read-only, e.g. before joining).
 */
export function useGameSession(gameId: string | null, creds: Credentials | null, opts: { screen?: boolean } = {}) {
  const screen = !!opts.screen;
  const [state, setState] = useState<{ gameId: string; game: Game | null; notFound: boolean } | null>(null);
  const [playback, setPlayback] = useState<ReceivedPlayback | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const token = creds?.token;
  const api = useMemo(() => (gameId && token ? gameApi(gameId, token) : null), [gameId, token]);

  // Ignore updates older than what we already have (e.g. an action response racing a stream event)
  const applyGame = useCallback((next: Game) => {
    setState(prev =>
      prev?.gameId === next.id && prev.game && prev.game.version > next.version
        ? prev
        : { gameId: next.id, game: next, notFound: false });
  }, []);

  useEffect(() => {
    if (!gameId) return;
    let disposed = false;
    let events: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = RETRY_MIN_MS;
    const markNotFound = () => setState({ gameId, game: null, notFound: true });

    const connect = () => {
      clearTimeout(retryTimer);
      events?.close();
      // The player's token decides what this device may see (EventSource can't send headers)
      const params = new URLSearchParams({ ...(screen ? { role: "screen" } : {}), ...(token ? { token } : {}) });
      const source = new EventSource(`/api/game/${gameId}/events${params.size ? `?${params}` : ""}`);
      events = source;
      source.onopen = () => { retryMs = RETRY_MIN_MS; };
      source.onmessage = e => {
        const event = JSON.parse(e.data) as StreamEvent;
        if (typeof event.now === "number") syncClock(event.now);
        if (event.type === "game") applyGame(event.game);
        else if (event.type === "playback") setPlayback({ data: event.playback, receivedAt: Date.now() });
        else { source.close(); markNotFound(); }
      };
      // EventSource retries network errors on its own, but gives up (CLOSED) on refused requests and
      // when mobile browsers drop it in the background: only a 404 means the game is really gone
      source.onerror = () => { if (source.readyState === EventSource.CLOSED) void recheck(); };
    };

    const recheck = async () => {
      const res = await fetch(`/api/game/${gameId}`).catch(() => null);
      if (disposed) return;
      if (res?.status === 404) { markNotFound(); return; }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    };

    // Back from the background (e.g. switching browsers): reconnect right away instead of waiting
    const onVisible = () => {
      if (document.visibilityState === "visible" && events?.readyState === EventSource.CLOSED) {
        retryMs = RETRY_MIN_MS;
        void recheck();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      events?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [gameId, applyGame, screen, token]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // One action after the other: a draft sent just before "Fertig" must not reach the server after it and undo it.
  // A request that hangs (bad Wi-Fi) holds the next one up for a few seconds at most.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const act = useCallback((action: Action) => {
    if (!api) return Promise.resolve();
    const previous = Promise.race([queue.current, new Promise<void>(r => setTimeout(r, ACTION_WAIT_MS))]);
    const sent = previous.then(async () => {
      const { game, error } = await api.act(action);
      if (game) applyGame(game);
      if (error) showNotice(error);
    });
    queue.current = sent.catch(() => {});
    return sent;
  }, [api, applyGame, showNotice]);

  const current = state?.gameId === gameId ? state : null;
  const controls: GameControls | null = useMemo(() => (api ? { api, act, applyGame } : null), [api, act, applyGame]);

  return {
    game: current?.game ?? null,
    notFound: current?.notFound ?? false,
    playback,
    notice,
    controls,
    applyGame,
  };
}

/** Interpolates the playback position between server updates. Only returns data for the given track. */
export function usePlaybackProgress(playback: ReceivedPlayback | null, trackId: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const isPlaying = !!playback?.data.isPlaying;
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isPlaying]);

  if (!playback || !trackId || playback.data.trackId !== trackId || !playback.data.durationMs) return undefined;
  const { data, receivedAt } = playback;
  const current = data.isPlaying ? data.progressMs + Math.max(0, now - receivedAt) : data.progressMs;
  return { current: Math.min(current, data.durationMs), duration: data.durationMs, isPlaying: data.isPlaying };
}
