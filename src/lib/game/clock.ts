/**
 * The server's clock on this device. Deadlines and countdowns (`playingAt`, `countdown.endsAt`, …) are server
 * timestamps; devices' clocks are often off by seconds (TVs, laptops without time sync), so counting down with
 * `Date.now()` showed a different time on every device. Every stream event carries the server's time; the offset
 * is the largest of the last samples, since a sample can only be late (by the time it took to arrive), never early.
 */
const SAMPLES = 10;
let samples: number[] = [];
let offset = 0;

/** Records the server's time `serverNow` of a message that arrived at `receivedAt` (this device's clock). */
export function syncClock(serverNow: number, receivedAt = Date.now()) {
  samples = [...samples.slice(-(SAMPLES - 1)), serverNow - receivedAt];
  offset = Math.max(...samples);
}

/** The current time by the server's clock (as far as this device knows it). */
export function serverNow() {
  return Date.now() + offset;
}

/** For tests: forget what was learned about the server's clock. */
export function resetClock() {
  samples = [];
  offset = 0;
}
