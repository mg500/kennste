"use client";

import { useEffect, useState } from "react";
import { serverNow } from "@/lib/game/clock";

/**
 * Seconds left of `limitSec` since `since` (the server's ms timestamp), ticking by the server's clock, so every
 * device shows the same. Null when there is no limit.
 */
export function useCountdown(limitSec: number, since: number | undefined, active: boolean) {
  const [now, setNow] = useState(serverNow);
  const running = active && !!since && limitSec > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(timer);
  }, [running]);
  if (!running) return null;
  const left = Math.min(limitSec, Math.max(0, limitSec - (now - since!) / 1000));
  return { seconds: Math.ceil(left), progress: left / limitSec, limit: limitSec };
}
