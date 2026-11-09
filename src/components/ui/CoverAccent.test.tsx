// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { contrast, coverAccent } from "@/lib/accentColor";
import { Stage } from "./Decor";

const accent = () => [
  document.documentElement.style.getPropertyValue("--cover-fill"),
  document.documentElement.style.getPropertyValue("--cover-text"),
];
afterEach(cleanup);

describe("Accent in the cover's color (Dunkel, Hell)", () => {
  it("the game's pages take on the running song's cover color – a grey cover keeps the one before", () => {
    const { rerender, unmount } = render(<Stage color={undefined}>Lobby</Stage>);
    expect(accent()).toEqual(["", ""]); // amber from globals.css until a song plays

    rerender(<Stage color="#4ea8ff">Runde</Stage>);
    const blue = coverAccent("#4ea8ff");
    expect(accent()).toEqual([blue.fill, blue.text]);
    rerender(<Stage color={undefined}>Nächste Runde</Stage>);
    expect(accent()).toEqual([blue.fill, blue.text]);

    unmount(); // leaving the game: the accent of the other pages again
    expect(accent()).toEqual(["", ""]);
  });

  it("stays readable for every cover color: dark ink on buttons, as text on dark grounds and on the light ones", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      for (const lightness of [0.55, 0.7]) {
        const color = `hsl(${hue}, 75%, ${lightness * 100}%)`;
        const hex = toHex(color);
        const { fill, text } = coverAccent(hex);
        expect(contrast(fill, "#111114"), `${color}: ink on fill`).toBeGreaterThanOrEqual(7);
        expect(contrast(fill, "#0b0b0f"), `${color}: Dunkel text on its ground`).toBeGreaterThanOrEqual(7);
        expect(contrast(fill, "#17171d"), `${color}: Dunkel text on cards`).toBeGreaterThanOrEqual(4.5);
        for (const ground of ["#f2f2f4", "#ffffff"]) expect(contrast(text, ground), `${color}: Hell text on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("a green cover doesn't make the accent green – green means \"richtig\"", () => {
    for (const cover of ["#1db954", "#4ce64c", "#99e64c", "#4ce699"]) {
      const hue = hueOf(coverAccent(cover).fill);
      expect(hue < 80 || hue > 160, `${cover} → hue ${hue}`).toBe(true);
    }
    expect(hueOf(coverAccent("#4c99e6").fill)).toBeCloseTo(hueOf("#4c99e6"), -1); // other colors keep their hue
  });
});

function toHex(hsl: string): string {
  const [h, s, l] = hsl.match(/[\d.]+/g)!.map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
