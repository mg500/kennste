// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Sheet } from "./Sheet";

beforeEach(() => { vi.useFakeTimers({ toFake: ["performance"] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function Demo({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Öffnen</button>
      <Sheet open={open} onClose={() => { setOpen(false); onClose?.(); }} title="Spielmenü">
        <button onClick={() => {}}>Ändern</button>
      </Sheet>
    </>
  );
}

/** A finger dragging from y=100 down by `dy` within `ms`. */
function swipe(el: Element, dy: number, ms: number) {
  fireEvent.pointerDown(el, { pointerType: "touch", pointerId: 1, clientY: 100 });
  vi.advanceTimersByTime(ms / 2);
  fireEvent.pointerMove(el, { pointerType: "touch", pointerId: 1, clientY: 100 + dy / 2 });
  vi.advanceTimersByTime(ms / 2);
  fireEvent.pointerUp(el, { pointerType: "touch", pointerId: 1, clientY: 100 + dy });
}

describe("Sheet", () => {
  it("closes when pulled down far enough, springs back after a short pull", () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    const grab = screen.getByTestId("sheet-grab");
    swipe(grab, 60, 600); // short and slow
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    swipe(grab, 200, 300);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on a quick flick, even a short one", () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    swipe(screen.getByTestId("sheet-grab"), 70, 50);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores the mouse – on a laptop it's a dialog in the middle", () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    const grab = screen.getByTestId("sheet-grab");
    fireEvent.pointerDown(grab, { pointerType: "mouse", pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerType: "mouse", pointerId: 1, clientY: 400 });
    fireEvent.pointerUp(grab, { pointerType: "mouse", pointerId: 1, clientY: 400 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("going back closes the sheet instead of leaving the page; closing it otherwise goes back by itself", async () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    expect(window.history.state?.sheet).toBeTruthy(); // an entry of its own

    await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: null })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();

    // Open again and close with a tap next to it: the extra history entry is taken back
    const back = vi.spyOn(window.history, "back");
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("a sheet opened right after another one closed stays open when that one's going back arrives", async () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    vi.spyOn(window.history, "back").mockImplementation(() => {}); // the popstate comes later, see below
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    // The going back of the closed sheet arrives now and lands on its done entry
    window.history.replaceState({ sheetDone: true }, "");
    await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1); // only the first close
    expect(window.history.state?.sheet).toBeTruthy();
  });
});
