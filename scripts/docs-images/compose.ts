import { readFileSync } from "node:fs";
import type { Browser } from "@playwright/test";

/** A raw screenshot and the viewport it was taken with (CSS pixels). */
export interface Shot { file: string; width: number; height: number }

const dataUrl = (shot: Shot) => `data:image/png;base64,${readFileSync(shot.file).toString("base64")}`;

/** Height of a phone in the composed image (CSS pixels, rendered at 2×). */
const PHONE_ALONE = 610;
const PHONE_NEXT_TO_TV = 360;
const TV_WIDTH = 540;

const phone = (shot: Shot, height: number, extra = "") => {
  const bezel = height > 400 ? 12 : 8;
  const width = Math.round((height - 2 * bezel) * shot.width / shot.height + 2 * bezel);
  return `<div class="phone" style="width:${width}px;height:${height}px;padding:${bezel}px;border-radius:${bezel * 4}px;${extra}">
    <img src="${dataUrl(shot)}" style="border-radius:${bezel * 3}px"></div>`;
};

const tv = (shot: Shot) => `<div class="tv" style="width:${TV_WIDTH}px"><img src="${dataUrl(shot)}"></div>`;

/**
 * Puts screenshots into device frames and writes one PNG with a transparent background: a phone alone, or a TV
 * with phones next to it (side by side, so the phone hides nothing on the TV).
 */
export async function compose(browser: Browser, out: string, { tv: screen, phones }: { tv?: Shot; phones: Shot[] }) {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const body = !screen
    ? phones.map(p => phone(p, PHONE_ALONE)).join("")
    : tv(screen) + phones.map(p => phone(p, PHONE_NEXT_TO_TV)).join("");
  await page.setContent(`<!doctype html><style>
    body { margin: 0; background: transparent; }
    #stage { display: inline-flex; align-items: center; gap: 22px; padding: 24px; }
    .tv, .phone { background: #18181b; box-shadow: 0 18px 40px rgb(0 0 0 / .28), 0 0 0 1px rgb(255 255 255 / .06) inset; flex: none; }
    .tv { padding: 8px; border-radius: 14px; }
    .tv img { display: block; width: 100%; border-radius: 6px; }
    .phone img { display: block; width: 100%; height: 100%; object-fit: cover; }
  </style><div id="stage">${body}</div>`);
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  await page.locator("#stage").screenshot({ path: out, omitBackground: true });
  await context.close();
}
