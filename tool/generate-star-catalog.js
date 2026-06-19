// Generates web/public/data/stars.bin from the HYG v3 star catalog.
// Takes the 10,000 brightest stars, converts to our equatorial Cartesian
// coordinate system (unit sphere), maps B-V to RGB, and writes a compact
// binary: [uint32 starCount][float32 x,y,z,r,g,b,mag × starCount].
//
// Run: node tool/generate-star-catalog.js

import { createReadStream, writeFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC  = '/tmp/hyg_v3.csv';
const OUT  = join(__dir, '../web/public/data/stars.bin');
const N    = 10_000;

// Map B-V colour index to linear RGB (approximate stellar chromaticity)
function bvToRgb(bv) {
  const t = Math.max(-0.4, Math.min(2.0, isNaN(bv) ? 0.2 : bv));
  let r, g, b;
  if (t < 0.0) {
    const s = (t + 0.4) / 0.4;
    r = 0.60 + s * 0.25; g = 0.70 + s * 0.20; b = 1.0;
  } else if (t < 0.3) {
    const s = t / 0.3;
    r = 0.85 + s * 0.15; g = 0.90 + s * 0.07; b = 1.00 - s * 0.10;
  } else if (t < 0.8) {
    const s = (t - 0.3) / 0.5;
    r = 1.0; g = 0.97 - s * 0.07; b = 0.90 - s * 0.25;
  } else if (t < 1.4) {
    const s = (t - 0.8) / 0.6;
    r = 1.0; g = 0.90 - s * 0.20; b = 0.65 - s * 0.20;
  } else {
    const s = Math.min((t - 1.4) / 0.6, 1.0);
    r = 1.0; g = 0.70 - s * 0.20; b = 0.45 - s * 0.10;
  }
  return [r, g, b];
}

const stars = [];
let header = true;

const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });

rl.on('line', line => {
  if (header) { header = false; return; }
  const c = line.split(',');
  const mag = parseFloat(c[13]);
  if (isNaN(mag) || mag > 9.0) return;   // pre-filter: skip very dim + sun
  const id  = parseInt(c[0]);
  if (id === 0) return;                   // exclude the sun
  const ra  = parseFloat(c[7])  * Math.PI / 12;  // hours → radians
  const dec = parseFloat(c[8])  * Math.PI / 180;
  if (isNaN(ra) || isNaN(dec)) return;
  const bv  = parseFloat(c[16]);
  const cd  = Math.cos(dec);
  // Equatorial Cartesian matching dirFromRaDec() in astro.js:
  //   x = cos(dec)*cos(ra),  y = sin(dec),  z = cos(dec)*sin(ra)
  stars.push({
    x: cd * Math.cos(ra),
    y: Math.sin(dec),
    z: cd * Math.sin(ra),
    mag,
    bv,
  });
});

rl.on('close', () => {
  // Sort brightest first, keep top N
  stars.sort((a, b) => a.mag - b.mag);
  const kept = stars.slice(0, N);

  console.log(`Catalog: ${stars.length} candidates → keeping ${kept.length}`);
  console.log(`Magnitude range: ${kept[0].mag.toFixed(2)} … ${kept[kept.length-1].mag.toFixed(2)}`);

  // Binary: 4-byte uint32 count + 7 float32 per star
  const buf = Buffer.allocUnsafe(4 + kept.length * 7 * 4);
  buf.writeUInt32LE(kept.length, 0);
  let off = 4;
  for (const s of kept) {
    const [r, g, b] = bvToRgb(s.bv);
    buf.writeFloatLE(s.x,   off);      off += 4;
    buf.writeFloatLE(s.y,   off);      off += 4;
    buf.writeFloatLE(s.z,   off);      off += 4;
    buf.writeFloatLE(r,     off);      off += 4;
    buf.writeFloatLE(g,     off);      off += 4;
    buf.writeFloatLE(b,     off);      off += 4;
    buf.writeFloatLE(s.mag, off);      off += 4;
  }

  mkdirSync(join(__dir, '../web/public/data'), { recursive: true });
  writeFileSync(OUT, buf);
  console.log(`✓ Wrote ${OUT}  (${(buf.length / 1024).toFixed(1)} KB)`);
});
