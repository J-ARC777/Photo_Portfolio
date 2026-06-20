// Loads the JSON manifest (§8) and exposes light query helpers.
// The front-end is a static consumer of plain data files.

export const CATEGORY_ORDER = ['Astro', 'Travel', 'Landscape', 'Nature', 'Film', 'Other Worlds'];

// Vite's configured base ('/' in dev, '/Photo_Portfolio/' in a production build). All
// runtime data/page URLs are built from this so the site works under a subpath on Pages.
const BASE = import.meta.env.BASE_URL;

let _cache = null;

export async function loadManifest() {
  if (_cache) return _cache;
  const res = await fetch(`${BASE}data/manifest.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const data = await res.json();
  // sort works within category by sequence (§8 sequence field)
  data.works.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  _cache = data;
  return data;
}

export function worksIn(manifest, category) {
  return manifest.works
    .filter((w) => w.category === category)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

export function countIn(manifest, category) {
  return manifest.works.filter((w) => w.category === category).length;
}

// 1D category sequence wraps THROUGH the splash (§3.3): splash is home base.
// Returns the href of the neighbour, or '/' (splash) at the loop seam.
export function neighbourHref(category, dir /* -1 prev, +1 next */) {
  const i = CATEGORY_ORDER.indexOf(category);
  const j = i + dir;
  if (j < 0 || j >= CATEGORY_ORDER.length) return BASE; // wrap through splash
  return pageFor(CATEGORY_ORDER[j]);
}

export function neighbourCategory(category, dir) {
  const i = CATEGORY_ORDER.indexOf(category);
  const j = i + dir;
  if (j < 0 || j >= CATEGORY_ORDER.length) return null;
  return CATEGORY_ORDER[j];
}

export function pageFor(category) {
  if (category === 'Astro') return `${BASE}astro.html`;
  if (category === 'Other Worlds') return `${BASE}other-worlds.html`;
  return `${BASE}${category.toLowerCase()}.html`;
}

// absence is silent (§2 corollary): only join fields that have a value.
export function metaParts(w) {
  const order = [
    ['cameraBody', (v) => v],
    ['lens', (v) => v],
    ['focalLength', (v) => v],
    ['aperture', (v) => v],
    ['shutter', (v) => v],
    ['iso', (v) => `ISO ${v}`],
    ['filmStock', (v) => v],
    ['date', (v) => v],
    ['location', (v) => v],
  ];
  // Astro plate-solve fields appended when present
  if (w.category === 'Astro') {
    if (w.raCenter != null) order.push(['raCenter', (v) => `RA ${fmtDeg(v)}`]);
    if (w.decCenter != null) order.push(['decCenter', (v) => `Dec ${fmtDeg(v)}`]);
  }
  return order
    .map(([k, fmt]) => (w[k] != null && w[k] !== '' ? fmt(w[k]) : null))
    .filter(Boolean);
}

function fmtDeg(v) {
  return `${Number(v).toFixed(1)}°`;
}

// Display image source. Placeholder works carry web.src; fall back to a
// CSS swatch handled by the caller if absent.
export function displaySrc(w) {
  return w.web?.src || null;
}
export function buttonSrc(w) {
  return w.web?.buttonCrop || w.web?.src || null;
}
export function navSampleSrc(w) {
  return w.web?.navSample || w.web?.buttonCrop || w.web?.src || null;
}
