import { describe, expect, it, vi } from "vitest";
import { handleHotkey } from "./hotkeys";

function key(k: string, extra: Record<string, unknown> = {}) {
  return { key: k, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn(), target: { tagName: "BODY" }, ...extra };
}

describe("handleHotkey", () => {
  it("runs the handler for space, letters (case-insensitive) and named keys", () => {
    const buzz = vi.fn(), right = vi.fn(), next = vi.fn();
    const handlers = { Space: buzz, r: right, Enter: next };
    const e = key(" ");
    expect(handleHotkey(e, handlers, false)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    handleHotkey(key("R"), handlers, false);
    handleHotkey(key("Enter"), handlers, false);
    expect([buzz, right, next].map(f => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it("ignores typing, modifiers, key repeat, open dialogs and disabled handlers", () => {
    const buzz = vi.fn();
    const handlers = { Space: buzz, s: false as const };
    expect(handleHotkey(key(" ", { target: { tagName: "INPUT" } }), handlers, false)).toBe(false);
    expect(handleHotkey(key(" ", { target: { tagName: "DIV", isContentEditable: true } }), handlers, false)).toBe(false);
    expect(handleHotkey(key(" ", { metaKey: true }), handlers, false)).toBe(false);
    expect(handleHotkey(key(" ", { repeat: true }), handlers, false)).toBe(false);
    expect(handleHotkey(key(" "), handlers, true)).toBe(false);
    expect(handleHotkey(key("s"), handlers, false)).toBe(false);
    expect(buzz).not.toHaveBeenCalled();
  });
});
