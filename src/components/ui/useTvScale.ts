"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

/** The TV views are laid out for this screen (everything fits there) and scaled to the actual one. */
export const TV_WIDTH = 1920;
export const TV_HEIGHT = 1080;

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const size = () => `${window.innerWidth}x${window.innerHeight}`;

/** Scale factor for a TV-sized layout on this window: a TV that reports 1280×720 or 960×540 sees the whole view. */
export function tvScale(width: number, height: number): number {
  return Math.min(width / TV_WIDTH, height / TV_HEIGHT);
}

/**
 * Style for the TV page's <main>: zoomed so the 1920×1080 layout fills the window without scrolling.
 * Width and height are set in px (not 100%/dvh), since zoom scales those as well – the same in old and new browsers.
 */
export function useTvScale(): CSSProperties | undefined {
  const key = useSyncExternalStore(subscribe, size, () => null);
  if (!key) return undefined;
  const [width, height] = key.split("x").map(Number);
  const scale = tvScale(width, height);
  return { zoom: scale, width: width / scale, minHeight: height / scale };
}
