"use client";

import { useEffect, useRef } from "react";

const IGNORED_TARGETS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** "Space", "Enter", "ArrowLeft", or a lower-case character like "r" or "1". */
function keyName(e: KeyboardEvent): string {
  if (e.key === " ") return "Space";
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

type Handlers = Record<string, (() => void) | false | undefined>;
type KeyEventLike = Pick<KeyboardEvent, "key" | "repeat" | "ctrlKey" | "metaKey" | "altKey" | "preventDefault"> & {
  target: { tagName?: string; isContentEditable?: boolean } | null;
};

/**
 * Runs the handler for a key press, unless the user is typing, uses modifier keys, holds the key
 * (repeat) or a modal dialog is open. Prevents the default so a focused button is not clicked twice.
 * Returns whether the key was handled.
 */
export function handleHotkey(e: KeyEventLike, handlers: Handlers, dialogOpen: boolean): boolean {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || dialogOpen) return false;
  const target = e.target;
  if (target && ((target.tagName && IGNORED_TARGETS.has(target.tagName)) || target.isContentEditable)) return false;
  const handler = handlers[keyName(e as KeyboardEvent)];
  if (!handler) return false;
  e.preventDefault();
  handler();
  return true;
}

/** Global keyboard shortcuts, see handleHotkey for when they are ignored. */
export function useHotkeys(handlers: Handlers, enabled = true) {
  const ref = useRef(handlers);
  useEffect(() => { ref.current = handlers; });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      handleHotkey(e as KeyEventLike, ref.current, !!document.querySelector('[role="dialog"][aria-modal="true"]'));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Keyboard shortcut label next to a control — only shown on desktop layouts. */
export function Kbd({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={`hidden min-w-6 items-center justify-center rounded-md border-2 border-current/25 px-1.5 font-sans text-xs font-bold opacity-80 lg:inline-flex ${className}`}>
      {children}
    </kbd>
  );
}
