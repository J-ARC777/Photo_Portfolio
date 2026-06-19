// Shared grid template (§5.4) — justified layout + in-place detail band (§5.5).
// Used by travel/landscape/nature/film pages.

import {
  loadManifest, worksIn, countIn, neighbourCategory, neighbourHref,
  navSampleSrc,
} from './manifest.js';
import { buildDetail } from './detail.js';
import { buildPicture } from './image.js';
import { prefersReduced, fadeIn } from './transitions.js';

const PANO_MAX = 16 / 9;

export async function initCategoryPage(category) {
  const manifest = await loadManifest();
  let works = worksIn(manifest, category);

  // a teaser cell on the splash can pass ?lead=<slug> → that image leads (§5.2)
  const lead = new URLSearchParams(window.location.search).get('lead');
  if (lead) {
    const i = works.findIndex((w) => w.slug === lead);
    if (i > 0) works = [works[i], ...works.slice(0, i), ...works.slice(i + 1)];
  }

  document.title = `${category} — Jeremy Ivan`;
  buildBoundary('top', category, manifest);
  buildBoundary('bottom', category, manifest);

  const head = document.querySelector('[data-head]');
  head.querySelector('[data-title]').textContent = category;
  head.querySelector('[data-count]').textContent = `( ${works.length} )`;

  const gridEl = document.querySelector('[data-grid]');
  renderGrid(gridEl, works);

  // a teaser click leads with ?lead → open that image straight into detail (§5.2)
  if (lead && works[0]?.slug === lead) openDetail(works, 0, gridEl);

  // re-justify on resize (debounced)
  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => renderGrid(gridEl, works, true), 120);
  });
}

function buildBoundary(side, category, manifest) {
  const bar = document.querySelector(`[data-boundary="${side}"]`);
  if (!bar) return;
  const dir = side === 'top' ? -1 : +1; // top = previous, bottom = next (§5.3)
  const neighbour = neighbourCategory(category, dir);
  const href = neighbourHref(category, dir);

  const fan = document.createElement('div');
  fan.className = 'boundary__fan';
  if (neighbour) {
    worksIn(manifest, neighbour).slice(0, 4).forEach((w) => {
      const src = navSampleSrc(w);
      if (src) {
        const img = document.createElement('img');
        img.src = src; img.alt = '';
        fan.appendChild(img);
      }
    });
  }

  const label = document.createElement('div');
  label.className = 'boundary__label';
  const dirLabel = document.createElement('span');
  dirLabel.className = 'boundary__dir';
  dirLabel.textContent = side === 'top' ? 'Previous' : 'Next';
  const name = document.createElement('span');
  name.className = 'boundary__name display';
  name.textContent = neighbour || 'Home';
  const cnt = document.createElement('span');
  cnt.className = 'count';
  cnt.textContent = neighbour ? `( ${countIn(manifest, neighbour)} )` : '↩';

  label.append(dirLabel, name, cnt);
  bar.append(fan, label);
  fadeIn(bar);
  bar.setAttribute('role', 'link');
  bar.tabIndex = 0;
  const go = () => { window.location.href = href; };
  bar.addEventListener('click', go);
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });
}

// --- justified layout: constant gutter, variable row height (§5.4) ---
function justify(works, containerWidth, gutter, target, min, max) {
  const rows = [];
  let row = [];
  let sumAspect = 0;
  const aspectOf = (w) => {
    let a = w.nativeAspect ?? 1.5;
    if (w.isPanorama) a = Math.min(a, PANO_MAX); // pano capped to 16:9 (§5.4)
    return a;
  };
  for (const w of works) {
    row.push(w);
    sumAspect += aspectOf(w);
    const gaps = (row.length - 1) * gutter;
    const rowHeight = (containerWidth - gaps) / sumAspect;
    if (rowHeight <= target) {
      rows.push({ items: row, height: clamp(rowHeight, min, max), last: false });
      row = [];
      sumAspect = 0;
    }
  }
  if (row.length) {
    // last row: left-justified at natural target height (§5.4)
    rows.push({ items: row, height: clamp(target, min, max), last: true });
  }
  return rows.map((r) => ({
    ...r,
    cells: r.items.map((w) => ({ w, width: aspectOf(w) * r.height })),
  }));
}

function renderGrid(gridEl, works, isResize) {
  const cs = getComputedStyle(gridEl);
  const width = gridEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gutter')) || 14;
  const target = numVar('--row-target', 320);
  const min = numVar('--row-min', 200);
  const max = numVar('--row-max', 460);

  const rows = justify(works, width, gutter, target, min, max);
  gridEl.innerHTML = '';
  let idx = 0;
  rows.forEach((r) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'grid__row' + (r.last ? ' last' : '');
    rowEl.style.height = `${r.height}px`;
    r.cells.forEach(({ w, width: cw }) => {
      // fade cells in on first render only — not on every resize re-justify
      rowEl.appendChild(makeCell(w, cw, r.last, gridEl, works, !isResize ? idx++ : -1));
    });
    gridEl.appendChild(rowEl);
  });
}

function makeCell(w, width, isLastRow, gridEl, works, fadeIndex) {
  const cell = document.createElement('button');
  cell.className = 'cell';
  cell.style.width = `${Math.round(width)}px`;
  if (isLastRow) cell.style.flex = '0 0 auto';
  if (fadeIndex >= 0) fadeIn(cell, fadeIndex);
  cell.setAttribute('aria-label', w.title || 'Open photograph');

  // the grid preserves NATIVE aspect — use the display rendition, never the 3:2
  // button crop (fidelity line §7; only the splash teaser uses the crop)
  const built = buildPicture(w, { sizes: `${Math.round(width)}px`, loading: 'lazy' });
  if (built) {
    const { picture, img } = built;
    if (w.accent) img.style.background = w.accent; // fills letterbox on object-fit:contain
    img.alt = w.alt || w.caption || w.title || 'photograph';
    cell.appendChild(picture);
  } else {
    cell.style.background = w.accent || 'var(--surface)';
  }
  if (w.isPanorama) {
    const tag = document.createElement('span');
    tag.className = 'cell__pano';
    tag.textContent = 'pano';
    cell.appendChild(tag);
  }
  cell.addEventListener('click', () => openDetail(works, works.indexOf(w), gridEl));
  return cell;
}

// --- in-place detail band: opens its own full-width row (§5.5) ---
let currentBand = null;

function openDetail(works, index, gridEl) {
  const work = works[index];
  // find the grid row holding this work's cell, insert band right after it
  const rowEls = [...gridEl.querySelectorAll('.grid__row')];
  let afterRow = rowEls[rowEls.length - 1];
  let seen = 0;
  for (const r of rowEls) {
    const n = r.querySelectorAll('.cell').length;
    if (index < seen + n) { afterRow = r; break; }
    seen += n;
  }

  closeDetail();
  const band = buildDetail(work, {
    onPrev: () => step(works, index, -1, gridEl),
    onNext: () => step(works, index, +1, gridEl),
    onClose: closeDetail,
  });
  afterRow.after(band);
  currentBand = band;
  bindKeys(works, index, gridEl);
  // center the band in the viewport after layout settles (esp. for ?lead opens)
  requestAnimationFrame(() =>
    band.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'center' }));
}

function step(works, index, dir, gridEl) {
  const next = (index + dir + works.length) % works.length;
  openDetail(works, next, gridEl);
}

function closeDetail() {
  currentBand?.remove();
  currentBand = null;
  document.removeEventListener('keydown', keyHandler);
}

let keyHandler = null;
function bindKeys(works, index, gridEl) {
  document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (e.key === 'ArrowLeft') step(works, index, -1, gridEl);
    else if (e.key === 'ArrowRight') step(works, index, +1, gridEl);
    else if (e.key === 'Escape') closeDetail();
  };
  document.addEventListener('keydown', keyHandler);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function numVar(name, fallback) {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}
