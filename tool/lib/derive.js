// Auto-derivation (§9 module 2): from a display rendition, produce the web
// pipeline — responsive sizes, blur placeholder, 3:2 button crop, blurred nav
// sample — plus extract+clamp the accent (§4.1) and flag shadowDensity (§5.5.2).
//
// print-master / print-proof / starless are uploaded manually elsewhere and
// never shipped to the browser; this module handles only the web renditions.

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKS_DIR } from './paths.js';

const SIZES = [400, 800, 1200, 1600, 2000];

export async function deriveWeb(inputBuffer, slug) {
  const outDir = join(WORKS_DIR, slug);
  await mkdir(outDir, { recursive: true });

  const img = sharp(inputBuffer, { failOn: 'none' }).rotate(); // respect EXIF orient
  const meta = await img.metadata();
  const width = meta.width || 1600;
  const height = meta.height || 1067;
  const nativeAspect = +(width / height).toFixed(4);

  // responsive sizes (jpg + webp), capped to native width — reserve space (no CLS)
  const srcsetJpg = [];
  for (const w of SIZES) {
    if (w > width * 1.05) continue;
    await sharp(inputBuffer).rotate().resize({ width: w })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(outDir, `display-${w}.jpg`));
    await sharp(inputBuffer).rotate().resize({ width: w })
      .webp({ quality: 80 })
      .toFile(join(outDir, `display-${w}.webp`));
    srcsetJpg.push({ w, jpg: `works/${slug}/display-${w}.jpg`, webp: `works/${slug}/display-${w}.webp` });
  }
  if (!srcsetJpg.length) {
    await sharp(inputBuffer).rotate().jpeg({ quality: 82 })
      .toFile(join(outDir, `display-${width}.jpg`));
    srcsetJpg.push({ w: width, jpg: `works/${slug}/display-${width}.jpg` });
  }
  const largest = srcsetJpg[srcsetJpg.length - 1];

  // 3:2 landscape button crop teaser (§5.2)
  await sharp(inputBuffer).rotate().resize({ width: 600, height: 400, fit: 'cover' })
    .jpeg({ quality: 80 }).toFile(join(outDir, 'button.jpg'));

  // blurred + desaturated nav-bar sample (§5.3)
  await sharp(inputBuffer).rotate().resize({ width: 320 }).blur(8)
    .modulate({ saturation: 0.5, brightness: 0.6 })
    .jpeg({ quality: 60 }).toFile(join(outDir, 'navsample.jpg'));

  // blur-up placeholder (tiny base64, inlined into manifest)
  const tiny = await sharp(inputBuffer).rotate().resize({ width: 20 }).blur(2)
    .jpeg({ quality: 40 }).toBuffer();
  const placeholder = `data:image/jpeg;base64,${tiny.toString('base64')}`;

  const accent = await extractAccent(inputBuffer);
  const shadowDensity = await measureShadows(inputBuffer);

  return {
    nativeAspect,
    dimensions: { width, height },
    accent,
    shadowDensity,
    web: {
      src: largest.jpg,
      srcset: srcsetJpg.map((s) => `${s.jpg} ${s.w}w`).join(', '),
      sizes: srcsetJpg,
      buttonCrop: `works/${slug}/button.jpg`,
      navSample: `works/${slug}/navsample.jpg`,
      placeholder,
    },
  };
}

// vibrant/characteristic swatch, then clamp L/S to a legibility floor on charcoal.
// The photo chooses the hue; the system guarantees contrast (§4.1).
export async function extractAccent(inputBuffer) {
  // sample a small set of pixels, pick the most colourful (not the dominant muddy bg)
  const { data, info } = await sharp(inputBuffer).rotate()
    .resize(48, 48, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let best = null, bestScore = -1;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    // colourfulness score: favour saturated mid-tones, penalise extremes
    const score = s * (1 - Math.abs(l - 0.5) * 1.4);
    if (score > bestScore) { bestScore = score; best = { h, s, l }; }
  }
  if (!best) return '#e0a94e';
  const s = Math.max(0.4, Math.min(0.85, best.s));
  const l = Math.max(0.5, Math.min(0.72, best.l)); // legibility floor on charcoal
  return hslToHex(best.h, s, l);
}

// fraction of near-black pixels → dark-print warning trigger (§5.5.2)
export async function measureShadows(inputBuffer) {
  const { data } = await sharp(inputBuffer).rotate()
    .greyscale().resize(64, 64, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (let i = 0; i < data.length; i++) if (data[i] < 60) dark++;
  return +(dark / data.length).toFixed(3);
}

// --- colour helpers ---
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, l };
}
function hslToHex(h, s, l) {
  h /= 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255);
  };
  const to = (v) => v.toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
