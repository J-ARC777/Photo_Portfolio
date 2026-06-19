// Auto-derivation (§9 module 2): from a display rendition, produce the web
// pipeline — responsive sizes, blur placeholder, 3:2 button crop, blurred nav
// sample — plus extract+clamp the accent (§4.1) and flag shadowDensity (§5.5.2).
//
// print-master / print-proof / starless are uploaded manually elsewhere and
// never shipped to the browser; this module handles only the web renditions.

import sharp from 'sharp';
import { mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKS_DIR } from './paths.js';
import { MAX_LONG_EDGE } from './config.js';
import { bakeRights } from './rights.js';

// Responsive steps are LONG-EDGE targets, capped at MAX_LONG_EDGE (§2.1): the real
// protection is a display-resolution ceiling — generous for full-screen viewing,
// insufficient for a quality large print. Capping the long edge (not just width) means
// tall portraits are bounded too.
//
// WebP is what ~99% of browsers actually receive (responsive set). A SINGLE JPEG is the
// universal fallback for the rare no-WebP browser, and doubles as the canonical `src`
// scrapers / social embeds / RSS pick up. We do NOT ship a JPEG per size — the front-end
// serves WebP via <picture> and only falls through to the one JPEG when WebP is unsupported.
const WEBP_SIZES = [400, 800, 1200, 1600, 2560].filter((s) => s <= MAX_LONG_EDGE);
const JPEG_FALLBACK = Math.min(1600, MAX_LONG_EDGE); // single jpg fallback (long edge)

export async function deriveWeb(inputBuffer, slug) {
  const outDir = join(WORKS_DIR, slug);
  await mkdir(outDir, { recursive: true });
  // remove stale display renditions from a previous derivation so re-deriving never leaves
  // orphans behind. Best-effort + per-file (never rmdir): on Windows a file held open by a
  // viewer can't be unlinked, and that must not abort the whole derivation — we overwrite
  // what we can and skip what's locked.
  for (const f of await readdir(outDir).catch(() => [])) {
    if (/^display-.*\.(jpe?g|webp)$/i.test(f)) {
      await rm(join(outDir, f), { force: true }).catch(() => {});
    }
  }

  const img = sharp(inputBuffer, { failOn: 'none' }).rotate(); // respect EXIF orient
  const meta = await img.metadata();
  const width = meta.width || 1600;
  const height = meta.height || 1067;
  const nativeAspect = +(width / height).toFixed(4);
  const nativeLongEdge = Math.max(width, height);

  const written = []; // absolute paths of every derivative, for rights baking

  // responsive WebP set. Resize into a square box → caps the LONG edge to the step (never
  // enlarges). The srcset width descriptor uses the ACTUAL output width.
  const webpList = [];
  for (const s of WEBP_SIZES) {
    if (s > nativeLongEdge * 1.05) continue;
    const box = { width: s, height: s, fit: 'inside', withoutEnlargement: true };
    const webpPath = join(outDir, `display-${s}.webp`);
    const info = await sharp(inputBuffer).rotate().resize(box)
      .webp({ quality: 80 }).toFile(webpPath);
    written.push(webpPath);
    webpList.push({ w: info.width, path: `works/${slug}/display-${s}.webp` });
  }
  if (!webpList.length) {
    // tiny source smaller than the smallest step: emit a single capped WebP
    const webpPath = join(outDir, `display-${nativeLongEdge}.webp`);
    const info = await sharp(inputBuffer).rotate()
      .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toFile(webpPath);
    written.push(webpPath);
    webpList.push({ w: info.width, path: `works/${slug}/display-${nativeLongEdge}.webp` });
  }

  // single JPEG fallback (capped to native + the global cap)
  const jpgEdge = Math.min(JPEG_FALLBACK, nativeLongEdge);
  const jpgPath = join(outDir, `display-${jpgEdge}.jpg`);
  await sharp(inputBuffer).rotate()
    .resize({ width: jpgEdge, height: jpgEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }).toFile(jpgPath);
  written.push(jpgPath);

  const largestWebp = webpList[webpList.length - 1].path;

  // 3:2 landscape button crop teaser (§5.2)
  const buttonPath = join(outDir, 'button.jpg');
  await sharp(inputBuffer).rotate().resize({ width: 600, height: 400, fit: 'cover' })
    .jpeg({ quality: 80 }).toFile(buttonPath);
  written.push(buttonPath);

  // blurred + desaturated nav-bar sample (§5.3)
  const navPath = join(outDir, 'navsample.jpg');
  await sharp(inputBuffer).rotate().resize({ width: 320 }).blur(8)
    .modulate({ saturation: 0.5, brightness: 0.6 })
    .jpeg({ quality: 60 }).toFile(navPath);
  written.push(navPath);

  // blur-up placeholder (tiny base64, inlined into manifest)
  const tiny = await sharp(inputBuffer).rotate().resize({ width: 20 }).blur(2)
    .jpeg({ quality: 40 }).toBuffer();
  const placeholder = `data:image/jpeg;base64,${tiny.toString('base64')}`;

  const accent = await extractAccent(inputBuffer);
  const shadowDensity = await measureShadows(inputBuffer);

  // bake IPTC/XMP rights into every web derivative (§2.2). Degrades gracefully if
  // ExifTool is absent — derivation still succeeds; rights.skipped is surfaced upstream.
  const rights = await bakeRights(written);

  return {
    nativeAspect,
    dimensions: { width, height },
    accent,
    shadowDensity,
    rights,
    web: {
      src: `works/${slug}/display-${jpgEdge}.jpg`, // JPEG fallback + canonical src
      srcsetWebp: webpList.map((x) => `${x.path} ${x.w}w`).join(', '), // responsive WebP
      largest: largestWebp,                          // biggest WebP, for the lightbox
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
