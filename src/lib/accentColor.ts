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
 * for large images.
 */
export function accentOf(rgba: ArrayLike<number>, step = 1): string | null {
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
  if (entries.reduce((n, e) => n + e.count, 0) < total * 0.05) return null;
  const best = entries.reduce((a, b) => (a.sat > b.sat ? a : b));
  const [h, , l] = rgbToHsl(Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count));
  return hslToHex(h, 0.75, Math.max(0.55, Math.min(0.7, l)));
}

export function extractAccentColor(imgSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = 50;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve("#1DB954");
      ctx.drawImage(img, 0, 0, size, size);
      resolve(accentOf(ctx.getImageData(0, 0, size, size).data) ?? "#1DB954");
    };
    img.onerror = () => resolve("#1DB954");
    img.src = imgSrc;
  });
}
