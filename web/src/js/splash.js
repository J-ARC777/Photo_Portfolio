// Splash (§5.1) — category teasers (§5.2) + synthetic starfield locked to the
// ~80vh hero box. The starfield is decorative, NOT the real plate-solved sky
// (separate engine; honesty seam §7). All auto-motion pauses on interaction
// (WCAG 2.2.2) and is gated behind prefers-reduced-motion.

import {
  loadManifest, worksIn, countIn, CATEGORY_ORDER, pageFor, buttonSrc,
} from './manifest.js';
import { fadeIn } from './transitions.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

init();

async function init() {
  const manifest = await loadManifest();
  buildCategories(manifest);

  // Astro is the star canvas itself, not a 3x3 button — surface its live count on the CTA
  const ac = document.querySelector('[data-astro-count]');
  if (ac) ac.textContent = `( ${countIn(manifest, 'Astro')} )`;

  startStarfield();
}

function buildCategories(manifest) {
  const host = document.querySelector('[data-categories]');
  // Astro is a featured peer with two ways in: the star canvas/CTA AND a teaser
  // button (§5.1). Layout flows 3-per-row with a centered overflow row.
  CATEGORY_ORDER.forEach((cat, i) => {
    const works = worksIn(manifest, cat);
    const btn = catButton(cat, works, countIn(manifest, cat));
    fadeIn(btn, i); // staggered fade-in across the row
    host.appendChild(btn);
  });
}

function catButton(category, works, count) {
  const btn = document.createElement('button');
  btn.className = 'cat';
  btn.setAttribute('aria-label', `${category}, ${count} works — open category`);

  const frame = document.createElement('div');
  frame.className = 'cat__frame';
  const cluster = document.createElement('div');
  cluster.className = 'cat__cluster';

  // hero cycles the curated subset; the 8 surrounds use a shared offset into the
  // full set so they stay MUTUALLY DISTINCT (no repeats) whenever there are
  // enough images (n >= 8). With fewer images, repeats are unavoidable (allowed).
  const heroPool = works.filter((w) => w.centerpieceEligible);
  const heroSet = heroPool.length ? heroPool : (works.length ? works : [null]);
  const n = works.length;

  const heroCell = makeCell(category, true);
  const surroundCells = [];
  const cells = [];
  for (let i = 0; i < 9; i++) {
    if (i === 4) { cells.push(heroCell); cluster.appendChild(heroCell.el); continue; }
    const c = makeCell(category, false);
    surroundCells.push(c);
    cells.push(c);
    cluster.appendChild(c.el);
  }
  // initial fill — distinct surrounds via slot offset
  heroCell.set(heroSet[0]);
  surroundCells.forEach((c, k) => c.set(n ? works[k % n] : null));

  frame.appendChild(cluster);

  // on the button face: NO text except the category label (testing feedback).
  // the live count stays in the aria-label for assistive tech, not on the image.
  const meta = document.createElement('div');
  meta.className = 'cat__meta';
  const name = document.createElement('span');
  name.className = 'cat__name';
  name.textContent = category;
  meta.append(name);

  btn.append(frame, meta);

  // keyboard / Enter on the button selects the hero (always meaningful)
  btn.addEventListener('click', () => navigate(category, heroCell.current()?.slug));

  wakeBehaviour(btn, frame, cluster, { heroCell, heroSet, surroundCells, works, n });
  return btn;
}

// a cell = two cross-fading layers; set(work) cross-fades to a given image
function makeCell(category, isHero) {
  const el = document.createElement('div');
  el.className = `cat__cell ${isHero ? 'hero' : 'ambient'}`;
  const layers = [layer(), layer()];
  el.append(layers[0], layers[1]);

  let shown = 0;
  let currentWork = null;

  function paint(layerEl, work) {
    const src = work && buttonSrc(work);
    if (src) { layerEl.src = src; layerEl.style.background = ''; }
    else { layerEl.removeAttribute('src'); layerEl.style.background = (work && work.accent) || 'var(--elevated)'; }
  }
  function set(work) {
    if (work === currentWork) return;
    const hidden = 1 - shown;
    paint(layers[hidden], work);
    layers[hidden].classList.add('shown');
    layers[shown].classList.remove('shown');
    shown = hidden;
    currentWork = work;
  }

  // click any cell → navigate with THAT image leading (one gesture, one result)
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    navigate(category, currentWork?.slug);
  });

  return { el, set, current: () => currentWork, portal: () => layers[shown] };

  function layer() {
    const img = document.createElement('img');
    img.className = 'layer';
    img.alt = '';
    img.loading = isHero ? 'eager' : 'lazy';
    return img;
  }
}

// idle cycling + hover pause + damped pan-over parallax
function wakeBehaviour(btn, frame, cluster, state) {
  const { heroCell, heroSet, surroundCells, works, n } = state;

  if (!REDUCED) {
    let timers = [];
    let heroIdx = 0;
    let offset = 0;
    const start = () => {
      stop();
      timers.push(setInterval(() => {                 // hero: curated subset (§5.2)
        heroIdx = (heroIdx + 1) % heroSet.length;
        heroCell.set(heroSet[heroIdx]);
      }, 6000));
      timers.push(setInterval(() => {                 // surrounds rotate as a block,
        if (n < 2) return;                            // staying mutually distinct
        offset = (offset + 1) % n;
        surroundCells.forEach((c, k) => c.set(works[(k + offset) % n]));
      }, 3200));
    };
    const stop = () => { timers.forEach(clearInterval); timers = []; };
    start();

    // interaction pauses cycling immediately (WCAG 2.2.2 pause path)
    btn.addEventListener('pointerenter', stop);
    btn.addEventListener('focusin', stop);
    btn.addEventListener('pointerleave', start);
    btn.addEventListener('focusout', start);

    // damped, auto-recentering pan across the cluster (same register as starfield)
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, hovering = false;
    const loop = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      cluster.style.transform = `scale(1.05) translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
      if (hovering || Math.abs(cx - tx) > 0.1 || Math.abs(cy - ty) > 0.1) {
        raf = requestAnimationFrame(loop);
      } else { raf = 0; }
    };
    btn.addEventListener('pointermove', (e) => {
      const r = frame.getBoundingClientRect();
      const maxX = r.width * 0.05, maxY = r.height * 0.05; // small clamped excursion
      tx = ((e.clientX - r.left) / r.width - 0.5) * -2 * maxX;
      ty = ((e.clientY - r.top) / r.height - 0.5) * -2 * maxY;
      hovering = true;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    btn.addEventListener('pointerleave', () => { tx = 0; ty = 0; hovering = false; });
  }
}

function navigate(category, slug) {
  const params = new URLSearchParams();
  if (slug) params.set('lead', slug);
  if (category === 'Astro') params.set('view', 'grid');
  const qs = params.toString();
  window.location.href = pageFor(category) + (qs ? '?' + qs : '');
}

// --- starfield locked to the hero box (bounds + parallax frame track the hero) ---
function startStarfield() {
  const hero = document.querySelector('[data-hero]');
  const canvas = document.querySelector('[data-stars]');
  if (!hero || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // no-canvas fallback → plate + UI only (nothing load-bearing)

  let stars = [];
  function seed() {
    const n = Math.min(380, Math.round((canvas.width * canvas.height) / 7000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random(), y: Math.random(), z: Math.random(), r: 0.3 + Math.random() * 1.3,
    }));
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = hero.clientWidth, h = hero.clientHeight; // sized to the HERO box
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    if (REDUCED) paint(0, 0); // single static composite
  }

  // parallax computed RELATIVE TO THE HERO BOX, not the window
  let tx = 0, ty = 0, gx = 0, gy = 0, scrollY = 0;
  if (!REDUCED) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      // negated → the field leans AWAY from the cursor (reversed direction)
      gx = -((e.clientX - r.left) / r.width - 0.5) * 2;
      gy = -((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    hero.addEventListener('pointerleave', () => { gx = 0; gy = 0; }); // recenter
    window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
  }

  const MAX_SHIFT = 56;    // pointer-tilt parallax (was 20 — ~3x deeper)
  const SCROLL_PAR = 0.5;  // exaggerated scroll-driven vertical parallax
  const FOLLOW = 0.02;     // low = heavily damped, lags well behind the cursor

  function paint(ox, oy) {
    const w = hero.clientWidth, h = hero.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const parY = scrollY * SCROLL_PAR;
    for (const s of stars) {
      const depth = 0.4 + s.z * 0.9;
      const x = s.x * w + ox * MAX_SHIFT * s.z;
      // deeper stars (higher z) move faster on scroll → pronounced depth parallax
      const y = s.y * h + oy * MAX_SHIFT * s.z - parY * (0.25 + s.z * 1.1);
      ctx.globalAlpha = 0.35 + s.z * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, s.r * depth, 0, Math.PI * 2);
      ctx.fillStyle = '#eef';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame() {
    // heavy damping + a slow target decay → motion trails the cursor and eases
    // back on its own, so it never feels 1:1 with the mouse
    tx += (gx - tx) * FOLLOW; ty += (gy - ty) * FOLLOW;
    gx *= 0.97; gy *= 0.97;
    paint(tx, ty);
    requestAnimationFrame(frame);
  }

  resize();
  // track the hero box on any reflow (dvh/svh recalc, responsive changes)
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize);

  if (!REDUCED) frame();
}
