// Splash (§5.1) — category teasers (§5.2) + synthetic starfield locked to the
// ~80vh hero box. The starfield is decorative, NOT the real plate-solved sky
// (separate engine; honesty seam §7). All auto-motion pauses on interaction
// (WCAG 2.2.2) and is gated behind prefers-reduced-motion.

import {
  loadManifest, worksIn, countIn, CATEGORY_ORDER, pageFor, buttonSrc,
} from './manifest.js';
import { fadeIn } from './transitions.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The deep parallax plate behind the synthetic starfield — a STARLESS galaxy so the
// decorative stars overlay cleanly without doubling. Swap the slug to change the plate.
const SPLASH_PLATE_SLUG = 'andromeda-galaxy-starless';

init();

async function init() {
  const manifest = await loadManifest();
  setSplashPlate(manifest);
  buildCategories(manifest);

  // Astro is the star canvas itself, not a 3x3 button — surface its live count on the CTA
  const ac = document.querySelector('[data-astro-count]');
  if (ac) ac.textContent = `( ${countIn(manifest, 'Astro')} )`;

  startStarfield();

  const identity = document.querySelector('.splash__identity');
  if (identity) {
    window.addEventListener('scroll', () => {
      identity.style.opacity = Math.max(0, 1 - window.scrollY / 220);
    }, { passive: true });
  }
}

// Drop the starless galaxy into the plate. Relative manifest path resolves against the
// document URL (so it's correct under the Pages base). A radial veil darkens the edges +
// keeps the title/tagline legible over the bright core; falls back to the CSS gradient if
// the work isn't in the manifest.
function setSplashPlate(manifest) {
  const plate = document.querySelector('[data-plate]');
  if (!plate) return;
  const work = (manifest.works || []).find((w) => w.slug === SPLASH_PLATE_SLUG);
  const src = work && work.web && (work.web.largest || work.web.src);
  if (!src) return;
  plate.style.backgroundImage = `url("${src}")`;
  // the plate element stays fixed — only the background image position moves,
  // drifting upward as the user scrolls so the galaxy core stays visible longer.
  window.addEventListener('scroll', () => {
    plate.style.backgroundPositionY = `calc(32% - ${window.scrollY * 0.25}px)`;
  }, { passive: true });
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
  // initial fill — surrounds never show the hero image; blank cells when pool is thin
  const initHero = heroSet[0];
  heroCell.set(initHero);
  const initPool = initHero ? works.filter(w => w !== initHero) : works;
  surroundCells.forEach((c, k) => c.set(k < initPool.length ? initPool[k] : null));

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
      timers.push(setInterval(() => {
        heroIdx = (heroIdx + 1) % heroSet.length;
        const newHero = heroSet[heroIdx];
        heroCell.set(newHero);
        if (n >= 2) {                                 // surrounds only reshuffle when
          offset = (offset + 1) % n;                 // the front image changes
          const pool = newHero ? works.filter(w => w !== newHero) : works;
          const plen = pool.length;
          surroundCells.forEach((c, k) =>
            c.set(k < plen ? pool[(k + offset) % plen] : null));
        }
      }, 6000));
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
  const HERO_COUNT = 7;
  function seed() {
    // unified pool — every star has its own z (distance) and therefore its own
    // parallax rate. No discrete layers. Power distribution (exponent 2.5) means
    // most stars cluster near z=0 (far, barely moving) and a handful land near z=1
    // (close, sweeping). Hero stars are seeded explicitly so we always have ≥7
    // clearly close foreground points.
    const total = Math.min(4500, Math.round((canvas.width * canvas.height) / 733));
    stars = [];

    // hero stars — explicitly close, always get the glow sprite
    for (let i = 0; i < HERO_COUNT; i++) {
      stars.push({
        x: Math.random(),
        y: -0.15 + Math.random() * 1.35,
        z: 0.80 + Math.random() * 0.20,
        r: (0.7 + Math.random() * 0.9) * (1.3 + Math.random() * 0.4),
        sx: 0.82 + Math.random() * 0.36,
        sy: 0.82 + Math.random() * 0.36,
      });
    }

    // field stars — logarithmic z: -log(rand)*k gives a heavy tail near 0 so ~85%
    // of stars barely drift while the top 10-15% have meaningful parallax depth.
    for (let i = HERO_COUNT; i < total; i++) {
      const z = Math.min(1, -Math.log(Math.random()) * 0.13);
      const rMult = 1 + Math.max(0, (z - 0.4) * 1.5); // size rises gently above z=0.4
      stars.push({
        x: Math.random(),
        y: -0.15 + Math.random() * 1.35, // ±15% buffer: scroll reveals stars at edges
        z,
        r: (z <= 0.5 ? 0.36 + Math.random() * 1.20   // 2× for far background
                    : 0.18 + Math.random() * 0.60)  // original for closer stars
             * rMult,
        sx: 0.82 + Math.random() * 0.36,
        sy: 0.82 + Math.random() * 0.36,
      });
    }
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = hero.clientWidth, h = hero.clientHeight; // sized to the HERO box
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    paint(tx, ty); // repaint immediately — avoids a blank frame when mobile browser chrome shows/hides
  }

  // parallax computed RELATIVE TO THE HERO BOX, not the window
  let tx = 0, ty = 0, vx = 0, vy = 0, gx = 0, gy = 0, scrollY = 0;
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

  const MAX_SHIFT = 95;    // pointer-tilt parallax — pulled back so close stars don't sweep too far
  const SCROLL_PAR = 0.45; // vertical drift on scroll — star depth separation reads as you move down
  const SPRING   = 0.001;  // spring stiffness — how fast velocity builds toward the mouse target
  const FRICTION  = 0.92;  // velocity retention per frame — higher = more coasting momentum

  // Pre-render a 64×64 glow sprite once: white-blue core fading to transparent.
  // drawImage is far cheaper than creating a radial gradient per star per frame.
  const starSprite = (() => {
    const S = 64, half = S / 2;
    const sc = document.createElement('canvas');
    sc.width = sc.height = S;
    const sg = sc.getContext('2d');
    const grad = sg.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0,    'rgba(230, 235, 255, 1.00)');
    grad.addColorStop(0.10, 'rgba(215, 225, 255, 0.90)');
    grad.addColorStop(0.30, 'rgba(200, 215, 255, 0.45)');
    grad.addColorStop(0.60, 'rgba(190, 210, 255, 0.12)');
    grad.addColorStop(1,    'rgba(190, 210, 255, 0.00)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, S, S);
    return sc;
  })();

  // Gradient sprite for close stars (z ≥ 0.8) — glow falloff makes them read as bright
  // foreground points. Drawn at 4× r so the halo has room to breathe.
  function drawSprite(cx, cy, r, sx = 1, sy = 1) {
    const w = r * 4 * sx, h = r * 4 * sy;
    ctx.drawImage(starSprite, cx - w / 2, cy - h / 2, w, h);
  }

  // Plain ellipse for the vast majority of background/mid stars — cheap and visible
  // at the small sizes these stars occupy.
  function drawEllipse(cx, cy, r, sx = 1, sy = 1) {
    const rx = Math.max(0.35, r * 0.55) * sx;
    const ry = Math.max(0.35, r * 0.55) * sy;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function paint(ox, oy) {
    const w = hero.clientWidth, h = hero.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const parY = scrollY * SCROLL_PAR;
    ctx.fillStyle = '#d8e2ff';
    for (const s of stars) {
      const depth = 0.25 + s.z * 1.75;
      const x = s.x * w + ox * MAX_SHIFT * s.z;
      const y = s.y * h + oy * MAX_SHIFT * s.z - parY * (0.15 + s.z * 1.6);
      ctx.globalAlpha = 0.28 + s.z * 0.62;
      if (s.z >= 0.8) {
        drawSprite(x, y, s.r * depth, s.sx, s.sy);
      } else {
        drawEllipse(x, y, s.r * depth, s.sx, s.sy);
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame() {
    vx += (gx - tx) * SPRING;  vy += (gy - ty) * SPRING;
    vx *= FRICTION;             vy *= FRICTION;
    tx += vx;                   ty += vy;
    paint(tx, ty);
    requestAnimationFrame(frame);
  }

  resize();
  // track the hero box on any reflow (dvh/svh recalc, responsive changes)
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize);

  if (!REDUCED) frame();
}
