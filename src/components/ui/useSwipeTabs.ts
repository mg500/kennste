"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

/** Sideways at least this far (px), and clearly more sideways than up or down, switches the tab. */
const SWIPE_DISTANCE = 60;
const SWIPE_RATIO = 1.5;
/** Swipes from the screen's left edge are the browser's back gesture (iOS). */
const EDGE = 24;

/**
 * Swiping left or right switches to the next or previous tab, like in an app (touch only; scrolling up and
 * down stays the browser's). Spread the result onto the element that holds the tabs' content.
 */
export function useSwipeTabs<T>(tabs: readonly T[], current: T, onChange: (tab: T) => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);
  return {
    style: { touchAction: "pan-y" } as const,
    onPointerDown: (e: PointerEvent) => {
      swiped.current = false;
      const typing = (e.target as Element).closest?.("input, textarea");
      start.current = e.pointerType === "touch" && e.clientX >= EDGE && !typing ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return;
      const next = tabs[tabs.indexOf(current) + (dx < 0 ? 1 : -1)];
      if (next === undefined) return;
      swiped.current = true;
      onChange(next);
    },
    onPointerCancel: () => { start.current = null; },
    /** A swipe that ends on a button must not press it. */
    onClickCapture: (e: MouseEvent) => {
      if (!swiped.current) return;
      swiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
