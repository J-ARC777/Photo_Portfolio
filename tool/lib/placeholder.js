// Placeholder generator — populates every category with stand-in works so the
// site is fully navigable before real photographs exist ("no images for now").
// Each placeholder is a real rendered image fed through the SAME derive pipeline
// (§9 module 2), so accent / shadowDensity / responsive sets are all exercised.

import sharp from 'sharp';
import { deriveWeb } from './derive.js';
import { makeSlug, nextSequence } from './manifest.js';

// per-category sample content: title, caption, varied aspect, hue, metadata
const SAMPLES = {
  Astro: [
    { t: 'Orion Nebula', cap: 'Hydrogen-alpha bloom in the sword of Orion.', a: 1.5, hue: 210, ra: 83.8, dec: -5.4, ce: true },
    { t: 'Andromeda', cap: 'Our nearest spiral, two million years away.', a: 1.6, hue: 30, ra: 10.7, dec: 41.3, ce: true },
    { t: 'Rho Ophiuchi', cap: 'Dust and starlight near Antares.', a: 1.4, hue: 340, ra: 246.8, dec: -24.4 },
    { t: 'Milky Way Core', cap: 'Galactic center over a dark sky site.', a: 2.4, hue: 270, ra: 266.4, dec: -29.0, pano: true },
    { t: 'Pleiades', cap: 'The seven sisters in reflection nebulosity.', a: 1.5, hue: 220, ra: 56.6, dec: 24.1 },
    { t: 'Lunar Terminator', cap: 'Raking light across the southern craters.', a: 1.0, hue: 40, ra: 200, dec: 10 },
    { t: 'Heart Nebula', cap: 'IC 1805 in narrowband.', a: 1.7, hue: 0, ra: 38.2, dec: 61.5, ce: true },
    { t: 'Comet Passage', cap: 'A faint visitor with its ion tail.', a: 1.5, hue: 160, ra: 150, dec: 20 },
  ],
  Travel: [
    { t: 'Harbor at Dusk', cap: 'Working boats settling for the night.', a: 1.5, hue: 24, ce: true },
    { t: 'Old Town Stairs', cap: 'Worn stone climbing between shutters.', a: 0.7, hue: 38 },
    { t: 'Market Morning', cap: 'First light over the produce stalls.', a: 1.6, hue: 50, ce: true },
    { t: 'Coastal Road', cap: 'Switchbacks above the water.', a: 2.6, hue: 200, pano: true },
    { t: 'Rooftop Lanterns', cap: 'A festival warming up after sunset.', a: 1.4, hue: 12 },
    { t: 'Tram Window', cap: 'The city sliding past in reflection.', a: 0.75, hue: 210 },
    { t: 'Desert Highway', cap: 'Heat haze and a vanishing line.', a: 1.8, hue: 30 },
  ],
  Landscape: [
    { t: 'Granite Basin', cap: 'Snowmelt pooling under the ridgeline.', a: 1.6, hue: 200, ce: true },
    { t: 'Valley Fog', cap: 'Inversion layer at first light.', a: 2.8, hue: 190, pano: true },
    { t: 'Autumn Larches', cap: 'Gold against the dark conifers.', a: 1.4, hue: 40, ce: true },
    { t: 'Sea Stack', cap: 'A lone tower in the outgoing tide.', a: 0.7, hue: 220 },
    { t: 'Alpine Tarn', cap: 'Still water holding the summits.', a: 1.5, hue: 210 },
    { t: 'Dune Field', cap: 'Wind-carved ridges before sunrise.', a: 1.7, hue: 28 },
    { t: 'Storm Front', cap: 'A squall line crossing the plain.', a: 2.2, hue: 250, pano: true },
  ],
  Nature: [
    { t: 'Heron at Rest', cap: 'Patience in the shallows.', a: 0.75, hue: 150, ce: true },
    { t: 'Fox in Snow', cap: 'Listening for movement beneath the crust.', a: 1.5, hue: 18 },
    { t: 'Dragonfly', cap: 'Wings catching the early sun.', a: 1.4, hue: 90 },
    { t: 'Old Growth', cap: 'Moss and filtered light.', a: 0.7, hue: 120, ce: true },
    { t: 'Tide Pool', cap: 'A small world between the rocks.', a: 1.6, hue: 170 },
    { t: 'Wildflower Meadow', cap: 'A short, bright season.', a: 1.8, hue: 300 },
  ],
  Film: [
    { t: 'Diner Counter', cap: 'Portra at the end of a shift.', a: 1.5, hue: 20, stock: 'Kodak Portra 400', ce: true },
    { t: 'Backyard, July', cap: 'Grain and afternoon haze.', a: 1.4, hue: 60, stock: 'Kodak Gold 200' },
    { t: 'Pier in Winter', cap: 'Cold light on Tri-X.', a: 1.6, hue: 210, stock: 'Kodak Tri-X 400' },
    { t: 'Portrait, Window Light', cap: 'Soft falloff across the cheek.', a: 0.75, hue: 30, stock: 'Ilford HP5', ce: true },
    { t: 'Neon, Rainy Night', cap: 'Cinestill halation doing its thing.', a: 1.5, hue: 330, stock: 'Cinestill 800T' },
    { t: 'Field Road', cap: 'Ektar holding the greens.', a: 2.3, hue: 100, stock: 'Kodak Ektar 100', pano: true },
  ],
};

const CAMERAS = ['Sony A7R V', 'Canon R5', 'Nikon Z8', 'Fujifilm GFX 100'];
const LENSES = ['24-70mm f/2.8', '35mm f/1.4', '70-200mm f/2.8', '16-35mm f/4'];

// build one placeholder Work, deriving its web renditions
export async function makePlaceholderWork(manifest, category, sample, idx) {
  const slug = makeSlug(sample.t, manifest.works);
  const dims = aspectToPixels(sample.a);
  const buffer = await renderSvg(sample, dims, category);
  const derived = await deriveWeb(buffer, slug);

  const work = {
    slug,
    title: sample.t,
    category,
    caption: sample.cap,
    sequence: nextSequence(manifest.works, category),
    centerpieceEligible: !!sample.ce,
    alt: `${sample.t} — placeholder image`,

    // capture metadata (omitted silently in UI if absent, §2)
    cameraBody: sample.stock ? null : CAMERAS[idx % CAMERAS.length],
    lens: LENSES[idx % LENSES.length],
    focalLength: sample.stock ? '50mm' : `${[24, 35, 85, 200][idx % 4]}mm`,
    aperture: ['f/1.4', 'f/2.8', 'f/8', 'f/11'][idx % 4],
    shutter: ['1/2000', '1/250', '1/60', '30s'][idx % 4],
    iso: [100, 400, 800, 3200][idx % 4],
    filmStock: sample.stock || null,
    date: `20${20 + (idx % 5)}`,
    location: category === 'Astro' ? 'Bortle 2 site' : 'Somewhere worth returning to',

    nativeAspect: derived.nativeAspect,
    isPanorama: !!sample.pano,
    shadowDensity: derived.shadowDensity,
    accent: derived.accent,

    // astro plate-solve fields (§8)
    ...(category === 'Astro'
      ? { raCenter: sample.ra, decCenter: sample.dec, rotation: 0, angularSize: 1.5, parity: 1 }
      : {}),

    // commerce — Phase 2 stub, reserved but dormant (§10)
    commerce: { printSizes: [], substrates: [], pricePer: {}, edition: null, printAdvisory: null },

    renditions: [{ role: 'display', colorSpace: 'srgb', profile: null, path: derived.web.src, dimensions: derived.dimensions }],
    web: derived.web,
    placeholder: true,
  };
  return work;
}

// fill every category that has no works yet (idempotent-ish: skips full cats)
export async function fillAll(manifest, { force = false } = {}) {
  const added = [];
  for (const [category, samples] of Object.entries(SAMPLES)) {
    const has = manifest.works.some((w) => w.category === category);
    if (has && !force) continue;
    for (let i = 0; i < samples.length; i++) {
      const work = await makePlaceholderWork(manifest, category, samples[i], i);
      manifest.works.push(work);
      added.push(work.slug);
    }
  }
  return added;
}

// add a single placeholder to one category (tool "Add placeholder" button)
export async function addOne(manifest, category) {
  const samples = SAMPLES[category] || SAMPLES.Travel;
  const i = manifest.works.filter((w) => w.category === category).length % samples.length;
  const work = await makePlaceholderWork(manifest, category, samples[i], i);
  manifest.works.push(work);
  return work;
}

function aspectToPixels(a) {
  const longEdge = 1800;
  return a >= 1
    ? { width: longEdge, height: Math.round(longEdge / a) }
    : { width: Math.round(longEdge * a), height: longEdge };
}

// render a labelled gradient card so each placeholder is visually distinct
async function renderSvg(sample, { width, height }, category) {
  const hue = sample.hue ?? 210;
  const c1 = `hsl(${hue} 45% 22%)`;
  const c2 = `hsl(${(hue + 40) % 360} 55% 14%)`;
  const accent = `hsl(${hue} 70% 62%)`;
  const fontSize = Math.round(Math.min(width, height) * 0.07);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="1" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width * 0.72}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.18}" fill="${accent}" opacity="0.35"/>
    <text x="50%" y="46%" fill="#ffffff" opacity="0.92" font-family="sans-serif"
      font-size="${fontSize}" font-weight="600" text-anchor="middle">${escapeXml(sample.t)}</text>
    <text x="50%" y="56%" fill="#ffffff" opacity="0.55" font-family="sans-serif"
      font-size="${Math.round(fontSize * 0.42)}" text-anchor="middle">${category} · placeholder · ${width}×${height}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
