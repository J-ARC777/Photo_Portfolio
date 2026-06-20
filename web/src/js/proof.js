// proof.js — Blender-rendered wall compositing viewer.
// Opened by "Wall Viewer" in detail.js; receives a work object.
//
// Pipeline per frame:
//   1. wall (crossfaded between keyframes)
//   2. wall × lerp(white, wallColor, blend)  — wall area only
//   3. shadow × multiply                      — full canvas (Shadow/ renders)
//   4. bounce × avgColor(photo) → add         (if Bounce/ renders exist)
//   5. litCard(imageRender, crop→AR) × photo → source-over

import { displaySrc } from './manifest.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const WALL_COUNT = 90;
const STEP       = 5;                            // sample every Nth frame; crossfade between neighbours
const KEY_COUNT  = Math.ceil(WALL_COUNT / STEP); // 18 keyframes
const SRC    = 2048;   // Blender render pixel dimensions
const CVS    = 1024;   // canvas draw size (½ for performance)
const S      = CVS / SRC;
const WALL_H = 945; // wall area only — excludes baseboard + floor

// ─── Asset paths ──────────────────────────────────────────────────────────────
// BASE is Vite's configured base ('/' dev, '/Photo_Portfolio/' on Pages).
const BASE = import.meta.env.BASE_URL;
const pad = i => String(i + 1).padStart(4, '0');
const wallPath   = i => `${BASE}vIewer_tool/Wall/Image${pad(i)}.jpg`;
const imagePath  = i => `${BASE}vIewer_tool/Image/Image${pad(i)}.jpg`;
const shadowPath = i => `${BASE}vIewer_tool/Shadow/Image${pad(i)}.jpg`;
const bouncePath = i => `${BASE}vIewer_tool/Bounce/${pad(i)}.jpg`;

// ─── Module-level frame caches (shared across detail-panel instances) ─────────
let   _maskBounds  = null;
const _wallCache   = new Map();
const _imageCache  = new Map();
const _shadowCache = new Map();
const _bounceCache = new Map();



// ─── Shared utilities ─────────────────────────────────────────────────────────
function loadImg(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error(src));
    img.src = src;
  });
}

// Fetches and caches a frame. Stores null on failure so we don't retry.
function fetchFrame(cache, pathFn, idx) {
  if (cache.has(idx)) return Promise.resolve(cache.get(idx));
  return loadImg(pathFn(idx))
    .then(img  => { cache.set(idx, img);  return img;  })
    .catch(()  => { cache.set(idx, null); return null; });
}

// Pre-warms the cache around both active keyframes without blocking.
function preload(cache, pathFn, i0, i1) {
  for (const base of [i0, i1]) {
    for (let d = -STEP; d <= STEP; d += STEP) {
      const i = base + d;
      if (i >= 0 && i <= (KEY_COUNT - 1) * STEP && !cache.has(i))
        fetchFrame(cache, pathFn, i);
    }
  }
}

function analyzeMask(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  tmp.getContext('2d').drawImage(img, 0, 0);
  const { data } = tmp.getContext('2d').getImageData(0, 0, W, H);
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4] > 128) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (x0 > x1) return null;
  const sx = SRC / W, sy = SRC / H;
  return {
    minX: Math.round(x0 * sx), minY: Math.round(y0 * sy),
    mw:   Math.round((x1 - x0 + 1) * sx),
    mh:   Math.round((y1 - y0 + 1) * sy),
    cx:   ((x0 + x1) / 2) * sx,
    cy:   ((y0 + y1) / 2) * sy,
  };
}

function computeAvgColor(img) {
  const N = 64, c = document.createElement('canvas');
  c.width = c.height = N;
  c.getContext('2d').drawImage(img, 0, 0, N, N);
  const { data } = c.getContext('2d').getImageData(0, 0, N, N);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < N * N * 4; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; }
  const n = N * N;
  return [Math.round(r/n), Math.round(g/n), Math.round(b/n)];
}

function computeFrameRect(bounds, photoW, photoH) {
  const { cx, cy, mw, mh } = bounds;
  const ar = photoW / photoH;
  let fw, fh;
  if (photoW >= photoH) { fh = mh; fw = Math.round(fh * ar); }
  else                  { fw = mw; fh = Math.round(fw / ar); }
  return { x: Math.round(cx - fw / 2), y: Math.round(cy - fh / 2), w: fw, h: fh };
}

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function buildProof(work) {
  const src    = displaySrc(work) || '';

  // ── DOM ────────────────────────────────────────────────────────────────────
  const wrap   = el('div', 'proof');
  const cvs    = el('canvas', 'proof__canvas');
  cvs.width    = CVS;
  cvs.height   = CVS;
  const ctrl   = el('div', 'proof__controls');
  wrap.append(cvs, ctrl);

  const ctx    = cvs.getContext('2d', { alpha: false });
  const offCvs = document.createElement('canvas');
  offCvs.width = offCvs.height = CVS;
  const offCtx = offCvs.getContext('2d', { alpha: true });

  // ── Per-instance state ─────────────────────────────────────────────────────
  let dayNight   = 0.5;
  let wallColor  = [208, 207, 200];
  let colorBlend = 0.75;
  let photo      = null;
  let avgColor   = [128, 128, 128];
  let maskBounds = null;
  let frameRect  = null;
  let rafId      = null;
  let destroyed  = false;

  // ── Fade-in — reveal once the initial view (2 bracketing keyframes) is ready ─
  // Only gate on the frames needed for dayNight=0.5 (the starting slider position)
  // so mobile doesn't fire 54 image requests at open-time. The existing preload()
  // call inside doRender() handles progressive loading as the slider moves.
  wrap.style.opacity    = '0';
  wrap.style.transition = 'opacity 0.4s ease';
  let _loadedCount = 0;
  const GATE = 4; // wall×2 + image×2 for initial bracket
  function onKeyframeReady() {
    if (++_loadedCount >= GATE) wrap.style.opacity = '1';
    scheduleRender();
  }

  // ── Asset loading ──────────────────────────────────────────────────────────
  if (_maskBounds) {
    maskBounds = _maskBounds;
  } else {
    loadImg(`${BASE}vIewer_tool/MASK.jpg`).then(img => {
      _maskBounds = analyzeMask(img);
      maskBounds  = _maskBounds;
      if (photo) frameRect = computeFrameRect(maskBounds, photo.naturalWidth, photo.naturalHeight);
      scheduleRender();
    }).catch(() => {});
  }

  if (src) {
    loadImg(src).then(img => {
      photo    = img;
      avgColor = computeAvgColor(img);
      if (maskBounds) frameRect = computeFrameRect(maskBounds, img.naturalWidth, img.naturalHeight);
      scheduleRender();
    }).catch(() => {});
  }

  // Load only the initial bracketing keyframes (for dayNight=0.5); the rest are
  // fetched on-demand via preload() inside doRender() as the slider moves.
  const { i0: initI0, i1: initI1 } = toKeyframes(dayNight);
  fetchFrame(_wallCache,   wallPath,   initI0).then(onKeyframeReady);
  fetchFrame(_wallCache,   wallPath,   initI1).then(onKeyframeReady);
  fetchFrame(_imageCache,  imagePath,  initI0).then(onKeyframeReady);
  fetchFrame(_imageCache,  imagePath,  initI1).then(onKeyframeReady);
  fetchFrame(_shadowCache, shadowPath, initI0);
  fetchFrame(_shadowCache, shadowPath, initI1);

  // ── Render ─────────────────────────────────────────────────────────────────
  // Maps slider t (0–1) to the two bracketing keyframe indices and blend alpha.
  // Keyframes are at real frame indices 0, STEP, 2*STEP … (KEY_COUNT-1)*STEP.
  function toKeyframes(t) {
    const kf    = t * (KEY_COUNT - 1);                    // 0–17 float
    const k0    = Math.min(Math.floor(kf), KEY_COUNT - 2); // clamp so k1 stays in range
    const k1    = k0 + 1;
    return { i0: k0 * STEP, i1: k1 * STEP, alpha: kf - k0 };
  }

  function scheduleRender() {
    if (destroyed || rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; doRender(); });
  }

  function doRender() {
    if (destroyed) return;
    const { i0, i1, alpha } = toKeyframes(dayNight);
    preload(_wallCache,   wallPath,   i0, i1);
    preload(_imageCache,  imagePath,  i0, i1);
    preload(_bounceCache, bouncePath, i0, i1);

    const wall0 = _wallCache.get(i0);
    const wall1 = alpha > 0 ? _wallCache.get(i1) : null;

    // Primary wall frame not in cache yet — placeholder, retry on load
    if (wall0 === undefined) {
      fetchFrame(_wallCache, wallPath, i0).then(scheduleRender);
      ctx.fillStyle = `rgb(${wallColor.join(',')})`;
      ctx.fillRect(0, 0, CVS, CVS);
      return;
    }
    if (!wall0) return;

    // ── 1. Draw wall (crossfaded) ─────────────────────────────────────────────
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(wall0, 0, 0, CVS, CVS);
    if (alpha > 0) {
      if (wall1 === undefined) {
        fetchFrame(_wallCache, wallPath, i1).then(scheduleRender); // non-blocking
      } else if (wall1) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(wall1, 0, 0, CVS, CVS);
        ctx.globalAlpha = 1;
      }
    }

    // ── 2. Multiply by soft wall color (wall area only — skip baseboard + floor)
    const [wr, wg, wb] = wallColor;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${Math.round(255 + (wr-255) * colorBlend)},${Math.round(255 + (wg-255) * colorBlend)},${Math.round(255 + (wb-255) * colorBlend)})`;
    ctx.fillRect(0, 0, CVS, WALL_H);

    if (!photo || !maskBounds || !frameRect) {
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    const imageFrame0 = _imageCache.get(i0);
    const imageFrame1 = alpha > 0 ? _imageCache.get(i1) : null;

    if (imageFrame0 === undefined) {
      fetchFrame(_imageCache, imagePath, i0).then(scheduleRender);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    if (!imageFrame0) { ctx.globalCompositeOperation = 'source-over'; return; }

    if (alpha > 0 && imageFrame1 === undefined) {
      fetchFrame(_imageCache, imagePath, i1).then(scheduleRender);
    }

    // Shared crop: center-crop image render to photo AR, no distortion
    const { mw, mh, cx, cy } = maskBounds;
    const { x, y, w, h }     = frameRect;
    const frameAR = w / h, maskAR = mw / mh;
    let cropW, cropH;
    if (frameAR >= maskAR) { cropW = mw; cropH = Math.round(mw / frameAR); }
    else                   { cropH = mh; cropW = Math.round(mh * frameAR); }
    const cropX = Math.round(cx - cropW / 2);
    const cropY = Math.round(cy - cropH / 2);
    const dx = x*S, dy = y*S, dw = w*S, dh = h*S;

    // ── 4. Bounce (crossfaded) — optional, skipped silently until renders exist
    const bounce0 = _bounceCache.get(i0);
    const bounce1 = alpha > 0 ? _bounceCache.get(i1) : null;
    if (bounce0) {
      const [ar, ag, ab] = avgColor;
      offCtx.globalCompositeOperation = 'source-over';
      offCtx.globalAlpha = 1;
      offCtx.clearRect(0, 0, CVS, CVS);
      offCtx.drawImage(bounce0, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
      if (alpha > 0 && bounce1) {
        offCtx.globalAlpha = alpha;
        offCtx.drawImage(bounce1, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
        offCtx.globalAlpha = 1;
      }
      offCtx.globalCompositeOperation = 'multiply';
      offCtx.fillStyle = `rgb(${ar},${ag},${ab})`;
      offCtx.fillRect(dx, dy, dw, dh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(offCvs, 0, 0);
    }

    // ── 5. Lit card (crossfaded) × photo → place directly over wall ──────────
    // Blending the two lit cards before multiplying the photo is mathematically
    // equivalent to blending the composited results: (a*f0 + b*f1)*p = a*f0*p + b*f1*p
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha = 1;
    offCtx.clearRect(0, 0, CVS, CVS);
    offCtx.filter = 'brightness(1.1)';
    offCtx.drawImage(imageFrame0, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
    if (alpha > 0 && imageFrame1) {
      offCtx.globalAlpha = alpha;
      offCtx.drawImage(imageFrame1, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
      offCtx.globalAlpha = 1;
    }
    offCtx.filter = 'none';
    offCtx.globalCompositeOperation = 'multiply';
    offCtx.drawImage(photo, dx, dy, dw, dh);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(offCvs, dx, dy, dw, dh, dx, dy, dw, dh);

    // ── 6. Shadow pass — after lit card so it falls on wall AND photo edges ───
    const shadow0 = _shadowCache.get(i0);
    const shadow1 = alpha > 0 ? _shadowCache.get(i1) : null;
    if (shadow0) {
      const sFudge  = 1.00;
      const sScaleX = (dw / mw) * sFudge;
      const sScaleY = (dh / mh) * sFudge;
      const sX = (dx + dw / 2) - cx * sScaleX;
      const sY = (dy + dh / 2) - cy * sScaleY;
      const sW = SRC * sScaleX;
      const sH = SRC * sScaleY;
      offCtx.globalCompositeOperation = 'source-over';
      offCtx.globalAlpha = 1;
      offCtx.clearRect(0, 0, CVS, CVS);
      offCtx.drawImage(shadow0, 0, 0, SRC, SRC, sX, sY, sW, sH);
      if (alpha > 0 && shadow1) {
        offCtx.globalAlpha = alpha;
        offCtx.drawImage(shadow1, 0, 0, SRC, SRC, sX, sY, sW, sH);
        offCtx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(offCvs, 0, 0, CVS, CVS);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  function row(label, input) {
    const d = el('div', 'proof__row');
    const s = el('span'); s.textContent = label;
    d.append(s, input); ctrl.appendChild(d);
    return input;
  }

  function hexToRgb(hex) {
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  }

  const wallColorInp = el('input');
  wallColorInp.type = 'color'; wallColorInp.value = '#d0cfc8';
  wallColorInp.addEventListener('input', () => { wallColor = hexToRgb(wallColorInp.value); scheduleRender(); });
  row('Wall color', wallColorInp);

  const blendInp = el('input');
  blendInp.type = 'range'; blendInp.min = 0; blendInp.max = 0.75; blendInp.step = 0.01; blendInp.value = colorBlend;
  blendInp.addEventListener('input', () => { colorBlend = Number(blendInp.value); scheduleRender(); });
  row('Color blend', blendInp);

  const lightInp = el('input');
  lightInp.type = 'range'; lightInp.min = 0; lightInp.max = 100; lightInp.value = Math.round(dayNight * 100);
  lightInp.addEventListener('input', () => { dayNight = Number(lightInp.value) / 100; scheduleRender(); });
  row('Sun angle', lightInp);

  if ((work.shadowDensity ?? 0) > 0.6) {
    const p = el('p', 'proof__warn');
    p.textContent = 'Shadow-rich image — drag toward Night to see how dark tones read in a dim room.';
    ctrl.appendChild(p);
  }

  const disc = el('p', 'proof__disclaimer');
  disc.textContent = 'Simulated approximation — Real print results will vary based on color-management and tend to appear darker and more saturated in normal lighting conditions.';
  ctrl.appendChild(disc);

  // ── Initial render ─────────────────────────────────────────────────────────
  doRender();

  // ── Cleanup ────────────────────────────────────────────────────────────────
  wrap._destroy = () => {
    destroyed = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  };

  return wrap;
}
