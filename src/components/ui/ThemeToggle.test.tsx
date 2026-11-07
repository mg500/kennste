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
  it("starts on Minimal, cycles Dunkel → Hell → Minimal and remembers the choice", async () => {
    render(<ThemeToggle />);
    // The toggle follows <html data-theme> through a MutationObserver, which reports asynchronously
    const next = async (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: /Stil wechseln/ }));
      expect((await screen.findByRole("button", { name: `Stil wechseln (aktuell ${name})` })).textContent).toBe(name);
    };
    expect(screen.getByRole("button", { name: /Stil wechseln/ }).textContent).toBe("Minimal");

    await next("Dunkel");
    await next("Hell");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(themeColor()).toBe("#f7efe3"); // the browser bar turns light, too

    await next("Minimal");
    expect(themeColor()).toBe("#0b0b0f");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("restores a saved light theme with its browser bar color before the app renders", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(themeColor()).toBe("#f7efe3");
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

  it("defines every color of the default theme in each theme", () => {
    const all = tokens("minimal");
    expect(all).toContain("primary-text");
    for (const { id } of THEMES) expect(tokens(id), id).toEqual(all);
  });
});
