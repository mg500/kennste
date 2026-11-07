// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";
import { THEMES, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

const themeColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "minimal";
  document.head.innerHTML = '<meta name="theme-color" content="#0b0b0f">';
});
afterEach(cleanup);

describe("ThemeToggle", () => {
  it("starts on Minimal, cycles Hell → Bühne → Minimal and remembers the choice", async () => {
    render(<ThemeToggle />);
    // The toggle follows <html data-theme> through a MutationObserver, which reports asynchronously
    const next = async (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: /Stil wechseln/ }));
      expect((await screen.findByRole("button", { name: `Stil wechseln (aktuell ${name})` })).textContent).toBe(name);
    };
    expect(screen.getByRole("button", { name: /Stil wechseln/ }).textContent).toBe("Minimal");

    await next("Hell");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(themeColor()).toBe("#f2f2f4"); // the browser bar turns light, too

    await next("Bühne");
    expect(document.documentElement.dataset.theme).toBe("stage");
    await next("Minimal");
    expect(themeColor()).toBe("#0b0b0f");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("restores a saved light theme with its browser bar color before the app renders", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(themeColor()).toBe("#f2f2f4");
  });

  it("falls back to Minimal for a style that no longer exists", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "party");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("minimal");
  });

  it("ignores an unknown saved value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("minimal");
  });
});

describe("globals.css", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
  const tokens = (id: string) => {
    const block = css.match(new RegExp(`\\[data-theme="${id}"\\] \\{([^}]*)\\}`))?.[1] ?? "";
    return [...block.matchAll(/--([\w-]+):/g)].map(m => m[1]).sort();
  };

  const values = (id: string) => {
    const block = css.match(new RegExp(`\\[data-theme="${id}"\\] \\{([^}]*)\\}`))?.[1] ?? "";
    const raw = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
    const resolve = (v: string): string => v.startsWith("var(--") ? resolve(raw[v.slice(6, -1)]) : v;
    return (name: string) => resolve(raw[name]);
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("keeps text readable in every style: on the ground, on cards and on accent fills (incl. the buzzer)", () => {
    for (const { id } of THEMES) {
      const v = values(id);
      for (const ground of ["bg", "surface"])
        for (const text of ["text", "muted", "primary-text", "positive-text", "buzz-text"])
          expect(contrast(v(text), v(ground)), `${id}: ${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      for (const fill of ["primary", "positive", "info", "p1", "p2", "p3", "p4", "p5", "p6"])
        expect(contrast(v("on-accent"), v(fill)), `${id}: on-accent on ${fill}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v("on-buzz"), v("buzz")), `${id}: on-buzz on buzz`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("defines every color of the default theme in each theme", () => {
    const all = tokens("minimal");
    expect(all).toContain("primary-text");
    for (const { id } of THEMES) expect(tokens(id), id).toEqual(all);
  });
});
