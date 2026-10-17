"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/** Dragged at least this far down (px), or flicked faster than DISMISS_SPEED (px/ms), the sheet closes. */
const DISMISS_DISTANCE = 120;
const DISMISS_SPEED = 0.6;
/** Movement before a touch counts as dragging (and no longer as a tap). */
const DRAG_START = 8;

/**
 * Going back (back gesture, back button) closes an open sheet instead of leaving the page: each open sheet adds a
 * history entry. A sheet closed otherwise (tap, swipe) marks its entry as done and goes back itself; a sheet opened
 * right after may get that `popstate` – landing on a done entry, it re-adds its own instead of closing.
 */
function useCloseOnBack(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const id = Math.random().toString(36).slice(2);
    // Next.js keeps its own data in the history state: keep it, without our markers
    const base = () => { const state = { ...window.history.state }; delete state.sheet; delete state.sheetDone; return state; };
    window.history.pushState({ ...base(), sheet: id }, "");
    let wentBack = false;
    const onPop = () => {
      if (window.history.state?.sheetDone) { window.history.pushState({ ...base(), sheet: id }, ""); return; }
      wentBack = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!wentBack && window.history.state?.sheet === id) {
        window.history.replaceState({ ...base(), sheetDone: true }, "");
        window.history.back();
      }
    };
  }, [open]);
}

/** Pulling the sheet down closes it, like a native bottom sheet (touch only; phones). */
function useSwipeToClose(panel: React.RefObject<HTMLDivElement | null>, open: boolean, onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const start = useRef<{ y: number; time: number; id: number } | null>(null);
  const dragged = useRef(false);

  // A scrollable sheet can only be pulled at its top (handle and title); otherwise anywhere
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const check = () => setScrollable(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [panel, open]);

  const down = (e: PointerEvent, fromHandle: boolean) => {
    if (e.pointerType === "mouse" || (scrollable && !fromHandle)) return;
    start.current = { y: e.clientY, time: performance.now(), id: e.pointerId };
    dragged.current = false;
  };
  const move = (e: PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - s.y);
    if (!dragged.current && dy > DRAG_START) {
      dragged.current = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (dragged.current) setOffset(dy);
  };
  const up = (e: PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || !dragged.current) return;
    const dy = Math.max(0, e.clientY - s.y);
    const speed = dy / Math.max(1, performance.now() - s.time);
    setDragging(false);
    setOffset(0);
    if (dy > DISMISS_DISTANCE || speed > DISMISS_SPEED) onClose();
  };
  const cancel = () => { start.current = null; setDragging(false); setOffset(0); };

  // The grab area handles its events itself – they must not reach the panel's handlers a second time
  const own = (fromHandle: boolean, f: (e: PointerEvent) => void) => (e: PointerEvent) => { if (fromHandle) e.stopPropagation(); f(e); };
  const handlers = (fromHandle: boolean) => ({
    onPointerDown: own(fromHandle, e => down(e, fromHandle)),
    onPointerMove: own(fromHandle, move),
    onPointerUp: own(fromHandle, up),
    onPointerCancel: own(fromHandle, cancel),
  });
  return {
    offset, dragging, scrollable, handlers,
    /** A drag that ends on a button must not press it. */
    swallowClick: (e: React.MouseEvent) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; } },
  };
}

/** Bottom sheet dialog. Closes on backdrop click, Escape, swiping it down or going back. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useCloseOnBack(open, onClose);
  const swipe = useSwipeToClose(panelRef, open, () => onCloseRef.current());

  // Only on open/close — re-running on every render would steal focus from inputs inside the sheet
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end lg:items-center lg:justify-center lg:p-8">
      <button aria-label="Schließen" onClick={onClose} className="absolute inset-0 cursor-default bg-black/60 transition-opacity"
        style={{ opacity: swipe.offset ? Math.max(0.2, 1 - swipe.offset / 400) : undefined }} />
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        {...swipe.handlers(false)} onClickCapture={swipe.swallowClick}
        style={{
          transform: swipe.offset ? `translateY(${swipe.offset}px)` : undefined,
          transition: swipe.dragging ? "none" : "transform 200ms ease",
          touchAction: swipe.scrollable ? "pan-y" : "none",
        }}
        className="relative mx-auto flex max-h-[90dvh] w-full max-w-md flex-col gap-5 overflow-y-auto overscroll-contain rounded-t-[28px] bg-surface px-5 pb-7 outline-none lg:max-w-lg lg:rounded-[28px] lg:px-7 lg:pt-7">
        {/* The grab area: handle and title, always draggable on phones */}
        <div {...swipe.handlers(true)} data-testid="sheet-grab" style={{ touchAction: "none" }}
          className="-mx-5 flex flex-col gap-3 px-5 pt-3 lg:mx-0 lg:px-0 lg:pt-0">
          <span aria-hidden className="h-1.5 w-11 self-center rounded-full bg-surface-2 lg:hidden" />
          <h2 className="font-display text-2xl font-extrabold">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
