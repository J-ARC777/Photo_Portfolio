# Photo Portfolio — Agent Handoff

Self-contained context for an agent picking this up on another machine. Pairs with
[`photography-portfolio-design-spec.md`](./photography-portfolio-design-spec.md) (the
authoritative design spec; §-references below point into it) and [`README.md`](./README.md).

## What this is
Phase-1 of a photography portfolio + print-sales site: a static front-end + a local
Node/Sharp content tool. Commerce (spec §10) is a reserved, disabled stub. Built from
scratch over several sessions; the spec's philosophy (§2 — stable, honest, restrained)
is the tie-breaker for anything ambiguous.

## Run it
```bash
npm install            # vite (dev) + sharp (tool) + three (astro WebGL)
npm run placeholders   # generate placeholder works for every category (no real photos yet)
npm run dev            # site  → http://localhost:5173   (vite, root = web/)
npm run tool           # content tool → http://localhost:4321
npm run build          # production build → dist/ (gitignored)
```
`web/public/data/manifest.json` and `web/public/works/` are generated (gitignored) — run
`npm run placeholders` first or the site has nothing to show. 34 placeholder works across
5 categories. Node 24, npm 11.

## Environment gotchas (IMPORTANT)
- **The Claude preview MCP (`preview_start`) is broken for this project.** It writes its
  launcher to `C:\temp_skyspace_dev.bat` keyed to a *different* project ("skyspace") and
  fails. So there has been **NO live browser verification** of any visual work — everything
  was verified via: (a) `npx vite web --port <p>` + `curl` HTTP checks that modules
  transform with no errors, (b) **jsdom** execution tests (install transiently with
  `npm install jsdom --no-save`, run a throwaway script under `tool/`, then delete it),
  and (c) `npm run build`. **A fresh visual pass in a real browser is the top priority** —
  expect to tune scales/timings, not fix logic.
- **npm prune caution:** a past `npm install <pkg> --no-save` + deleting
  `node_modules/.package-lock.json` once pruned `vite`/`sharp`. If deps vanish, just
  `npm install` again from the project root. Always run npm from `D:\Photo_Portfolio`
  (the shell cwd has drifted to the home dir before — use absolute paths).
- Windows host; this lived at `D:\Photo_Portfolio`. On a new machine the path differs —
  nothing is path-hardcoded except the Skyspace source reference below.

## Layout
```
web/                         static front-end (no build step needed for dev; ES modules)
  index.html                 Splash
  travel|landscape|nature|film.html   shared grid template (differ only by category)
  astro.html                 Astrophotography (Three.js sky map + grid toggle)
  src/styles/tokens.css      design tokens (palette, type, --vt-dur fade timing)
  src/styles/main.css        all component styles
  src/js/manifest.js         loads /data/manifest.json + query helpers
  src/js/splash.js           splash: starfield + 3×3 category teasers
  src/js/grid.js             shared grid template: justified layout + in-place detail band
  src/js/detail.js           detail band builder (shared by grid + astro) incl. proofing room
  src/js/astro.js            Three.js planetarium (perspective camera + DOM photo markers)
  src/js/starfield.js        trimmed Three.js star-sprite point cloud (ported from Skyspace)
  src/js/transitions.js      prefersReduced() + fadeIn() helpers
  web/public/data/manifest.json   generated
  web/public/works/<slug>/        generated renditions
  web/public/star_2d_{tight,wide}.png   star sprite textures (copied from Skyspace)
tool/                        local content tool
  server.js + ui.html        web UI (ingest/curate) on :4321, no auth (spec §9)
  lib/derive.js              Sharp pipeline: responsive jpg/webp, blur placeholder, 3:2
                             button crop, blurred nav sample, clamped accent, shadowDensity
  lib/placeholder.js         placeholder-work generator (SVG → Sharp → same derive pipeline)
  lib/manifest.js, paths.js  atomic manifest read/write (write-temp-rename), slug, reorder
  generate-placeholders.js   CLI used by `npm run placeholders`
```

## Current feature state (all implemented; pending visual confirmation)
**Splash (`splash.js`, §5.1–5.2):** synthetic decorative starfield on a `<canvas>` LOCKED
to the ~80svh hero box (parallax computed relative to the hero, tracks it on resize). 5
category teaser buttons incl. **Astro** (featured peer — also reachable via the "Enter the
sky map" CTA), laid out 3-per-row with a centered overflow row. Each teaser = 3×3 of 3:2
uniform-crop cells, enlarged center hero (cycles the centerpiece subset), 8 ambient
surrounds (shared-offset mapping so they stay mutually DISTINCT when ≥8 images). On the
button face: only the category label (count is in aria-label). Clicking any cell navigates
with `?lead=<slug>`. Starfield knobs in `startStarfield`: `MAX_SHIFT` (pointer parallax
depth, currently 56), `SCROLL_PAR` (scroll parallax, 0.5), `FOLLOW` (damping/lag, 0.02);
pointer response is REVERSED (field leans away from cursor) per user pref.

**Category pages (`grid.js`, §5.3–5.5):** boundary nav bars (top=prev, bottom=next, wrap
through splash), real **justified grid** preserving native aspect (uses the display
rendition + srcset, NOT the 3:2 crop — fidelity §7), in-place **detail band** (its own
full-width row). `?lead=` reorders that work first AND auto-opens its detail. Cells fade in
staggered on first render only (not on resize).

**Detail band (`detail.js`, §5.5):** image + info panel; photo-derived accent; metadata as a
silently-omitting inline list; disabled "View prints" stub; dark-print warning when
`shadowDensity > 0.6`; prev/next arrows top-RIGHT of image, close top-left; larger size
clamps; **proofing room** ("Viewing tools") = full-RGB wall color picker + day/night +
**Print surface** selector (Fine-art rag / Cotton canvas / Photo poster) using procedural
SVG `feTurbulence` tooth textures + uniform sheen, `isolation:isolate` so they blend; no
frame border; portrait fits (object-fit contain). This is a CSS/SVG approximation, NOT real
WebGL PBR.

**Astro sky map (`astro.js` + `starfield.js`, §5.6):** see the dedicated section below.

**Transitions (`transitions.js`, §6):** went through several iterations (cross-document View
Transitions with a window-open portal) but the user found them inconsistent/flickery and we
**simplified to a per-element fade-in on page load** — `@keyframes fade-in` + `.fade-in` +
staggered `fadeIn(el, i)`. Navigation is plain page load; white flash avoided by inline
`<style>html{background:#17171b}</style>` in every page head. Fade duration is
`--vt-dur` in tokens.css (currently **2000ms** — user was trialing 2s; may want to settle
~600–1000ms). NO View-Transitions code remains.

## Astro star map — the Three.js port (most recent work)
The old 2D-canvas equirectangular starfield had a **pole cutoff** (flat projection, stars
only exist dec −90..90) and read poorly. Replaced with a **trimmed port of Skyspace's
`StarField`**:
- Source of truth: `C:\Users\Jeremy\Documents\Claude Projects\skyspace\Skyspace\src\core\StarField.js`
  (Skyspace is a separate Three.js stellar-cartography app on the original machine). If you
  can't access it, `web/src/js/starfield.js` already contains the full port.
- `starfield.js` keeps the **exact sprite vertex/fragment shaders + tuned uniforms**
  (uExposure 0.4, uTightBaseSize 2 / uWideBaseSize 21, uSizeMin 2.6 / uSizeMax 110,
  uBodyMag 2..7.1, uTexGamma 2.2, bloom gamma 12, motionBlur 0.6) and the two sprite PNGs.
- **Deliberately dropped (kept it lightweight per user):** rings, constellation lines,
  star selection/picking, EffectComposer/Rayleigh/UnrealBloom, the `stars.bin` catalog, and
  all distance/parallax simulation. Stars are a synthetic on-sphere catalog
  (`makeSyntheticCatalog`, ~4200 stars, radius 800, no distances).
- `astro.js` uses a real `THREE.PerspectiveCamera` at the origin that rotates in place
  (drag = pan/tilt via lookAt, wheel = FOV zoom) → **no pole cutoff**. Photos stay crisp DOM
  markers, projected through the same camera each frame (`positionPhotos` via
  `Vector3.project`); click via `elementFromPoint`. Renders on-demand (pan/zoom/slew/resize),
  still at rest (spec §5.6). Detail opens in a fixed BOTTOM panel (user pref).
- `three@0.184.0` is a dependency; the astro chunk is ~511 kB and loads only on the astro
  page (matches spec: WebGL only on Astro + splash).
- **Tunable knobs** (top of files): `FOV_BASE` (80°), `FOV_MIN/MAX`, `PHOTO_ANG` (0.17 =
  photo marker angular size), catalog star count, and the `starfield.js` uniform values
  (exposure/base sizes/uMinMag density). These are the most likely things to need tuning
  once seen in a browser.

## Data model (spec §8)
Two-tier Work/Rendition JSON manifest. Work fields used by the front-end: slug, title,
category, caption, sequence, centerpieceEligible, nativeAspect, isPanorama, accent,
shadowDensity, raCenter/decCenter (Astro), web{ src, srcset, buttonCrop, navSample,
placeholder }, alt, capture metadata (all optional, omitted silently in UI). Tool writes
the manifest atomically.

## Categories order
Astro → Travel → Landscape → Nature → Film (1-D sequence; wraps through the splash). Order
choice is still **[OPEN]** in the spec (curatorial vs alphabetical).

## Not done / next candidates
- **Real photographs** — only placeholders exist; ingest real ones via the tool (same Sharp
  pipeline). AVIF output is not enabled (JPEG+WebP only — verify Sharp AVIF support first).
- **Visual QA pass in a real browser** (preview MCP is broken here) — tune star scale/
  brightness, photo marker size, fade duration (2s likely too slow), splash parallax amounts.
- Author-side **proofing workstation** with offline gamma generation (spec §9 module 4).
- Commerce (spec §10) — currently a reserved disabled stub.
- Real-PBR proofing textures (currently SVG/CSS approximation).
- Star-map cluster fan-out for overlapping images (spec §5.6) — not implemented.

## Conventions
Vanilla ES modules, no framework. Match surrounding code style. Keep WebGL/heavy JS off the
LCP path. Honor `prefers-reduced-motion` everywhere (a global CSS block collapses durations).
Absence is silent — never render empty/placeholder metadata fields.
