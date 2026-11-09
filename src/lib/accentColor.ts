function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The cover's main color, bright enough to glow on a dark background: the hue with the most saturated pixels,
 * or null for covers that are nearly black, white or grey. `rgba` holds 4 bytes per pixel; `step` skips pixels
 * for large images; `minShare`: how many pixels have to be colorful at all.
 */
export function accentOf(rgba: ArrayLike<number>, step = 1, minShare = 0.05): string | null {
  const buckets: Record<number, { count: number; r: number; g: number; b: number; sat: number }> = {};
  for (let i = 0; i < rgba.length; i += 4 * step) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.25 || l < 0.15 || l > 0.85) continue;
    const bucket = Math.floor(h / 15) * 15;
    if (!buckets[bucket]) buckets[bucket] = { count: 0, r: 0, g: 0, b: 0, sat: 0 };
    buckets[bucket].count++;
    buckets[bucket].r += r; buckets[bucket].g += g; buckets[bucket].b += b;
    buckets[bucket].sat += s;
  }
  const entries = Object.values(buckets);
  // A few colored pixels on a dark cover don't make it colorful
  const total = rgba.length / 4 / step;
  if (!entries.length || entries.reduce((n, e) => n + e.count, 0) < total * minShare) return null;
  const best = entries.reduce((a, b) => (a.sat > b.sat ? a : b));
  const [h, , l] = rgbToHsl(Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count));
  return hslToHex(h, 0.75, Math.max(0.55, Math.min(0.7, l)));
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Green means "richtig" after a reveal: a green cover gives yellow or turquoise instead. */
const GREENS: [number, number] = [80, 160];
/** The dark ink on accent fills ("Dunkel" and "Hell" alike) and the light grounds of "Hell". */
const INK = "#111114";
const LIGHT_GROUNDS = ["#f2f2f4", "#ffffff"];

/**
 * The accent of "Dunkel" and "Hell" for a song's cover color (Game.stageColor): its hue – green turned towards yellow
 * or turquoise – as bright as the dark ink on buttons needs (`fill`, also the text color on dark grounds), and as dark
 * as text on the light grounds of "Hell" needs (`text`).
 */
export function coverAccent(color: string): { fill: string; text: string } {
  let [h] = rgbToHsl(...hexToRgb(color));
  if (h >= GREENS[0] && h <= GREENS[1]) h = h < (GREENS[0] + GREENS[1]) / 2 ? 55 : 185;
  let fill = 0.55;
  while (fill < 0.9 && contrast(hslToHex(h, 0.75, fill), INK) < 7) fill += 0.01;
  let text = 0.45;
  while (text > 0.1 && LIGHT_GROUNDS.some(g => contrast(hslToHex(h, 0.75, text), g) < 4.5)) text -= 0.01;
  return { fill: hslToHex(h, 0.75, fill), text: hslToHex(h, 0.75, text) };
}

/** The main color of a cover image in the browser, or null when it can't be read. */
export function extractAccentColor(imgSrc: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = 50;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, size, size);
      // Unlike the stage light, a small colored logo on a dark cover still gives the page its color
      resolve(accentOf(ctx.getImageData(0, 0, size, size).data, 1, 0));
    };
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}
