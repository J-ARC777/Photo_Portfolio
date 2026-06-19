// Generates web/public/milkyway.png — an equirectangular galactic-coordinate texture
// used as an additive luminance overlay on the astro sky sphere.
//
// Coordinate layout (matching buildMilkyWay() rotation matrix in astro.js):
//   u=0.5 (px=W/2)  → galactic centre  l=0°,  b=0°
//   u=0 / u=1       → anti-centre      l=±180°
//   v=1 (py=0)      → NGP              b=+90°
//   v=0 (py=H)      → SGP              b=−90°
//
// Features: galactic plane + centre bulge, spiral-arm patches, domain-warped
// FBM nebulosity, dust lanes, colour temperature (warm core / blue-white arms).
//
// Run: node tool/generate-milkyway.js

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../web/public/milkyway.png');

const W = 2048, H = 1024;

// ── fast integer hash → [0, 1) ──────────────────────────────────────────────
function h3(ix, iy, iz) {
  // Murmur3-inspired 32-bit hash (no transcendental functions)
  let n = (Math.imul(ix, 1664525) ^ Math.imul(iy, 1013904223) ^ Math.imul(iz, 214013)) | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) | 0;
  return ((n >>> 1) / 2147483647.0);
}

function s3(t) { return t * t * (3 - 2 * t); }   // smoothstep

function vn3(x, y, z) {                           // trilinear value noise
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = s3(x - ix), fy = s3(y - iy), fz = s3(z - iz);
  const v000 = h3(ix,   iy,   iz),   v100 = h3(ix+1, iy,   iz);
  const v010 = h3(ix,   iy+1, iz),   v110 = h3(ix+1, iy+1, iz);
  const v001 = h3(ix,   iy,   iz+1), v101 = h3(ix+1, iy,   iz+1);
  const v011 = h3(ix,   iy+1, iz+1), v111 = h3(ix+1, iy+1, iz+1);
  const L = (a, b, t) => a + t * (b - a);
  return L(L(L(v000, v100, fx), L(v010, v110, fx), fy),
           L(L(v001, v101, fx), L(v011, v111, fx), fy), fz);
}

function fbm3(x, y, z, oct = 6, lac = 2.1, gain = 0.5) {
  let v = 0, a = 0.5, s = 0;
  for (let i = 0; i < oct; i++) {
    v += vn3(x, y, z) * a; s += a;
    a *= gain; x *= lac; y *= lac; z *= lac;
  }
  return v / s;
}

function gauss(x, sigma) { return Math.exp(-x * x / (2 * sigma * sigma)); }

// Signed angular difference in degrees, wrapped to (−180, 180]
function adiff(a, b) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return d;
}

// ── pixel loop ───────────────────────────────────────────────────────────────
const buf = Buffer.alloc(W * H * 3);
const t0 = Date.now();

for (let py = 0; py < H; py++) {
  if (py % 64 === 0) process.stdout.write(`\r  ${Math.round(py / H * 100)}% ...`);

  for (let px = 0; px < W; px++) {

    // Galactic coordinates
    const l  = (px / W - 0.5) * 360;   // −180..+180  (0 = GC, ±180 = anti-centre)
    const b  = (0.5 - py / H) * 180;   // +90..−90
    const db = Math.abs(b);

    // 3-D noise coordinates — wraps seamlessly in X by projecting onto a torus
    const theta = (px / W) * Math.PI * 2;
    const NR = 2.5;
    const NX = Math.cos(theta) * NR;
    const NZ = Math.sin(theta) * NR;
    const NY = (py / H) * 5.0;

    // Domain-warped nebulosity
    const wX = (fbm3(NX + 0.3, NY + 0.1, NZ + 0.7, 4) - 0.5) * 1.4;
    const wZ = (fbm3(NX + 1.7, NY + 0.9, NZ + 2.1, 4) - 0.5) * 1.4;
    const neb  = fbm3(NX + wX, NY + wZ, NZ,       6);   // primary cloud
    const neb2 = fbm3(NX * 1.6 + 3, NY * 1.6 + 2, NZ * 1.6 + 1, 5);  // fine detail

    // ── galactic plane ───────────────────────────────────────────────────────
    const planeCore = gauss(db, 4.0) * 0.85;
    const planeHalo = gauss(db, 11)  * 0.28;
    const plane     = (planeCore + planeHalo) * (0.38 + neb * 0.78 + neb2 * 0.18);

    // ── galactic centre bulge ────────────────────────────────────────────────
    const dl      = adiff(l, 0);
    const gcR     = Math.sqrt(dl * dl + b * b);
    const gcBulge = gauss(gcR, 14) * 1.05;
    const gcCore  = gauss(gcR,  5) * 1.15;

    // ── spiral-arm patches ───────────────────────────────────────────────────
    // Each arm patch: brighter knot centred at (lC, ~0) in the plane
    function arm(lC, lSig, bSig, str) {
      return gauss(adiff(l, lC), lSig) * gauss(db, bSig) * str;
    }
    const arms
      = arm( 28, 12, 3.0, 0.45)   // Scutum-Centaurus arm
      + arm( 55,  8, 2.5, 0.34)   // Aquila / Serpens region
      + arm( 82, 10, 3.0, 0.40)   // Cygnus X
      + arm(110, 12, 2.8, 0.25)   // Cygnus OB2 → Cassiopeia
      + arm(135, 14, 3.5, 0.28)   // Perseus arm
      + arm(170, 13, 2.8, 0.20)   // Auriga (near anti-centre)
      + arm(-33, 10, 2.8, 0.32)   // Norma / Sagittarius
      + arm(-70, 20, 4.0, 0.44);  // Carina-Sagittarius arm

    // ── dust lanes ───────────────────────────────────────────────────────────
    // Primary obscuration lane through the inner plane
    const dustN1 = fbm3(NX * 1.2 + 5, NY * 2.5 + 3, NZ * 1.4 + 7, 5);
    const dust1  = planeCore * Math.pow(Math.max(0, dustN1 - 0.47), 1.7) * 2.4;
    // Patchy dark clouds scattered in the inner halo
    const dustN2 = fbm3(NX * 2 + 2, NY * 3 + 1, NZ * 2 + 4, 4);
    const dust2  = gauss(db, 6) * Math.pow(Math.max(0, dustN2 - 0.53), 2.0) * 3.8;
    // Rift corridor (splits the core band l ≈ 20..80°)
    const inRift = gauss(adiff(l, 50), 35) * gauss(db, 3.5);
    const riftN  = fbm3(NX * 1.8 + 9, NY * 4 + 6, NZ * 1.8 + 3, 4);
    const dust3  = inRift * Math.pow(Math.max(0, riftN - 0.44), 1.5) * 2.0;

    // ── combine brightness ───────────────────────────────────────────────────
    let bright = plane + gcBulge + gcCore + arms
                 - dust1 * 0.80 - dust2 * 0.55 - dust3 * 0.65;
    bright = Math.max(0, bright);
    bright = Math.pow(bright, 3.0);      // crush darks, keep only the brightest structure
    bright = Math.min(1.0, bright);

    // ── colour ───────────────────────────────────────────────────────────────
    // Warm yellow-white at the core, blue-white in outer spiral arms,
    // slight violet tint in the diffuse halo.
    const warmMix = Math.min(1, gcBulge * 1.7 + gcCore * 2.2);
    const blueMix = Math.min(1, (arm(82, 10, 3.0, 1) + arm(135, 14, 3.5, 1)
                              + arm(170, 13, 2.8, 1)) * 2.5);

    let R = bright * (0.88 + warmMix * 0.22 - blueMix * 0.18);
    let G = bright * (0.85 + warmMix * 0.06 - blueMix * 0.06);
    let B = bright * (0.68 - warmMix * 0.18 + blueMix * 0.30 + gauss(db, 12) * 0.08);

    // Luma-preserving saturation boost
    const luma = R * 0.299 + G * 0.587 + B * 0.114;
    const SAT = 2.2;
    R = luma + (R - luma) * SAT;
    G = luma + (G - luma) * SAT;
    B = luma + (B - luma) * SAT;

    R = Math.max(0, Math.min(1, R));
    G = Math.max(0, Math.min(1, G));
    B = Math.max(0, Math.min(1, B));

    const idx = (py * W + px) * 3;
    buf[idx]   = Math.round(R * 255);
    buf[idx+1] = Math.round(G * 255);
    buf[idx+2] = Math.round(B * 255);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
process.stdout.write(`\r  100% (${elapsed}s)\n`);

await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
  .blur(1.0)                          // smooth sub-pixel noise artifacts
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log('✓ Wrote', OUT);
