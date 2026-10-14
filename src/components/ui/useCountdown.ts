"use client";

import { useEffect, useState } from "react";

/** Seconds left of `limitSec` since `since` (ms timestamp), ticking. Null when there is no limit. */
export function useCountdown(limitSec: number, since: number | undefined, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  const running = active && !!since && limitSec > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  if (!running) return null;
  const left = Math.min(limitSec, Math.max(0, limitSec - (now - since!) / 1000));
  return { seconds: Math.ceil(left), progress: left / limitSec };
}
