// Astro star map (§5.6) — a fixed planetarium. A Three.js perspective camera
// sits at the origin and rotates in place (pan/tilt = orientation, zoom = FOV).
// Stars are a sprite point cloud on a surrounding sphere (see starfield.js) — so
// there's no pole cutoff. Photographs are pinned at their plate-solved RA/Dec and
// drawn as crisp DOM markers, projected through the same camera each frame.

import * as THREE from 'three';
import { loadManifest, worksIn, buttonSrc } from './manifest.js';
import { buildDetail } from './detail.js';
import { initCategoryPage } from './grid.js';
import { fadeIn } from './transitions.js';
import { StarField, makeSyntheticCatalog } from './starfield.js';

const FOV_BASE = 80;   // vertical FOV in degrees at zoom 1 (wide)
const FOV_MIN = 11;
const FOV_MAX = 92;
const R = 800;         // sphere radius for stars + pinned photos
const PHOTO_ANG = 0.17; // angular size of a photo marker (radians) → scales with zoom
const DEC_LIMIT = 88;  // avoid the exact pole (camera up would be singular)

init();

async function init() {
  const manifest = await loadManifest();
  const works = worksIn(manifest, 'Astro');
  const sky = document.querySelector('[data-sky]');
  const layer = document.querySelector('[data-layer]');
  const canvas = document.querySelector('[data-starcanvas]');
  const countEl = document.querySelector('[data-skyview] [data-count]');
  if (countEl) countEl.textContent = `( ${works.length} )`;

  const lead = new URLSearchParams(window.location.search).get('lead');
  const leadIdx = lead ? works.findIndex((w) => w.slug === lead) : -1;
  const entry = leadIdx >= 0 ? works[leadIdx] : pickEntry(works);

  const cam = { ra: entry ? entry.raCenter ?? 180 : 180, dec: entry ? entry.decCenter ?? 0 : 0, zoom: 1 };
  let selectedIndex = null;

  // ── Three.js scene: camera at the origin, stars on the surrounding sphere ──
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0); // transparent → the CSS gradient shows through
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, R * 4);
  const starField = new StarField(makeSyntheticCatalog(4200, R));
  scene.add(starField.points);

  const _tmpFwd = new THREE.Vector3();
  const _tmpP = new THREE.Vector3();

  function fovV() { return clamp(FOV_BASE / cam.zoom, FOV_MIN, FOV_MAX); }
  function dirFromRaDec(raDeg, decDeg) {
    const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180, cd = Math.cos(dec);
    return new THREE.Vector3(cd * Math.cos(ra), Math.sin(dec), cd * Math.sin(ra));
  }

  function resize() {
    const w = sky.clientWidth, h = sky.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    starField.setResolution(w, h);
  }

  // photo markers — built once, repositioned every render
  const nodes = works.map((wk, i) => {
    const node = document.createElement('div');
    node.className = 'astro__img';
    node.dataset.idx = i;
    node.dataset.slug = wk.slug;
    const src = buttonSrc(wk);
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = wk.title || 'astrophotograph';
      node.appendChild(img);
    } else {
      node.style.background = wk.accent || 'var(--elevated)';
    }
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', wk.title || 'Open astrophotograph');
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openImage(i); }
    });
    node.style.display = 'none';
    layer.appendChild(node);
    return { node, dir: dirFromRaDec(wk.raCenter ?? 180, wk.decCenter ?? 0), work: wk };
  });

  function positionPhotos() {
    const W = sky.clientWidth, H = sky.clientHeight;
    camera.getWorldDirection(_tmpFwd);
    const sizePx = PHOTO_ANG * (H / 2) / Math.tan(camera.fov * Math.PI / 360);
    nodes.forEach(({ node, dir, work }, i) => {
      if (dir.dot(_tmpFwd) <= 0.05) { node.style.display = 'none'; return; } // behind
      _tmpP.copy(dir).multiplyScalar(R).project(camera);
      if (_tmpP.z > 1) { node.style.display = 'none'; return; }
      const x = (_tmpP.x * 0.5 + 0.5) * W, y = (-_tmpP.y * 0.5 + 0.5) * H;
      if (x < -240 || x > W + 240 || y < -240 || y > H + 240) { node.style.display = 'none'; return; }
      const a = work.nativeAspect ?? 1.4;
      node.style.display = '';
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.width = `${sizePx}px`;
      node.style.height = `${sizePx / a}px`;
      node.classList.toggle('selected', i === selectedIndex);
    });
  }

  function render() {
    camera.fov = fovV();
    camera.updateProjectionMatrix();
    const fwd = dirFromRaDec(cam.ra, clamp(cam.dec, -DEC_LIMIT, DEC_LIMIT));
    camera.lookAt(fwd.x, fwd.y, fwd.z);
    starField.setFov(camera.fov);
    starField.updateMotion(camera);
    renderer.render(scene, camera);
    positionPhotos();
  }

  // ── pan/tilt by drag; a no-move pointerup is a SELECT ──
  let dragging = false, moved = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
  sky.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    lastX = downX = e.clientX; lastY = downY = e.clientY;
    sky.classList.add('grabbing');
    sky.setPointerCapture(e.pointerId);
  });
  sky.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) moved = true;
    const dpp = fovV() / sky.clientHeight; // degrees per pixel ≈ vertical FOV / height
    cam.ra = wrap(cam.ra - (e.clientX - lastX) * dpp);
    cam.dec = clamp(cam.dec + (e.clientY - lastY) * dpp, -DEC_LIMIT, DEC_LIMIT);
    lastX = e.clientX; lastY = e.clientY;
    render();
  });
  sky.addEventListener('pointerup', (e) => {
    const wasClick = dragging && !moved;
    dragging = false; sky.classList.remove('grabbing');
    if (!wasClick) return;
    const node = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.astro__img');
    if (node && node.dataset.idx != null) openImage(+node.dataset.idx);
  });
  sky.addEventListener('pointercancel', () => { dragging = false; sky.classList.remove('grabbing'); });
  sky.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89), 1, 8);
    render();
  }, { passive: false });

  document.querySelector('[data-reset]')?.addEventListener('click', () => { cam.zoom = 1; render(); });

  // grid toggle (§5.6)
  const skyView = document.querySelector('[data-skyview]');
  const gridView = document.querySelector('[data-gridview]');
  async function setMode(mode) {
    skyView.hidden = mode !== 'sky';
    gridView.hidden = mode !== 'grid';
    window.scrollTo(0, 0);
    if (mode === 'grid') {
      if (!gridView.dataset.built) {
        gridView.dataset.built = '1';
        await initCategoryPage('Astro');
      } else {
        window.dispatchEvent(new Event('resize'));
      }
    } else {
      resize(); render();
    }
  }
  document.querySelector('[data-toggle]')?.addEventListener('click', () => setMode('grid'));
  document.querySelector('[data-to-sky]')?.addEventListener('click', () => setMode('sky'));

  function openImage(index) {
    const wk = works[index];
    selectedIndex = index;
    render(); // immediate hairline on the selected marker
    slew(cam, wk.raCenter ?? cam.ra, wk.decCenter ?? cam.dec, render, () => {
      const host = document.querySelector('[data-astro-detail]');
      host.innerHTML = '';
      const band = buildDetail(wk, {
        onPrev: () => openImage((index - 1 + works.length) % works.length),
        onNext: () => openImage((index + 1) % works.length),
        onClose: () => { host.innerHTML = ''; selectedIndex = null; render(); },
      });
      host.appendChild(band);
    });
  }
  document.querySelector('[data-astro-detail]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) { e.currentTarget.innerHTML = ''; selectedIndex = null; render(); }
  });

  resize();
  render();
  fadeIn(skyView);
  if (leadIdx >= 0) openImage(leadIdx);
  window.addEventListener('resize', () => { resize(); render(); });
}

function slew(cam, ra, dec, render, done) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cam.ra = ra; cam.dec = dec; render(); done(); return;
  }
  const fromRa = cam.ra, fromDec = cam.dec;
  let dRa = wrap(ra - fromRa); if (dRa > 180) dRa -= 360;
  const start = performance.now(), dur = 600;
  function tick(t) {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    cam.ra = wrap(fromRa + dRa * e);
    cam.dec = fromDec + (dec - fromDec) * e;
    render();
    if (k < 1) requestAnimationFrame(tick); else done();
  }
  requestAnimationFrame(tick);
}

function pickEntry(works) {
  if (!works.length) return null;
  const weighted = works.flatMap((w) => (w.centerpieceEligible ? [w, w, w] : [w]));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function wrap(deg) { return ((deg % 360) + 360) % 360; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
