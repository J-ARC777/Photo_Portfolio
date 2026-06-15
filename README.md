# Photography Portfolio

First-pass implementation of [`photography-portfolio-design-spec.md`](./photography-portfolio-design-spec.md) — Phase 1 (front-end + content tool). Commerce (§10) is a reserved, disabled stub.

## What's here

```
web/      static front-end (no build step needed for dev; ES modules)
tool/     local Node + Sharp content tool — ingest, curate, write the manifest
web/public/data/manifest.json   the JSON manifest (§8); generated, git-ignored
web/public/works/<slug>/         derived web renditions per work
```

### Front-end (`web/`)
- **Splash** (`index.html`) — synthetic decorative starfield + 3×3 category teasers (§5.1–5.2).
- **Category pages** (`travel|landscape|nature|film.html`) — the shared grid template: boundary nav bars (§5.3), justified grid (§5.4), in-place detail band (§5.5) with the photo-derived accent, metadata inline list, the viewing-tools "proofing room", and a disabled commerce stub.
- **Astro** (`astro.html`) — a fixed planetarium (camera pans/tilts, never flies; §5.6), images pinned at plate-solved RA/Dec, plus a grid-view toggle that reuses the shared grid + detail band.
- `prefers-reduced-motion` is honoured throughout; absent fields are omitted silently (§2).

### Content tool (`tool/`)
A local web UI (no auth, no hosting — §9). Sharp derives the web pipeline from one display rendition: responsive JPEG/WebP, blur-up placeholder, 3:2 button crop, blurred nav sample, the clamped photo **accent**, and the **shadowDensity** dark-print flag. Writes the manifest **atomically** (write-temp-then-rename).

## Getting started

```bash
npm install                 # installs vite + sharp (sharp is a native module)
npm run placeholders        # populate every category with placeholder works
npm run dev                 # serve the site  → http://localhost:5173
npm run tool                # serve the content tool → http://localhost:4321
```

Run `npm run placeholders` (or click **Fill empty categories** in the tool) before opening the site, so there is something to browse. Real photographs go through the tool's **Ingest** form, which runs the same Sharp pipeline.

> No real images yet — every category is filled with labelled placeholder cards (varied aspect ratios, a few panoramas, plate-solved coordinates for Astro) so the full navigation, justified grid, detail band, and star map are all exercisable.

## Still open (per spec §11, not built in this pass)
Commerce (§10); the author-side proofing **workstation** with offline gamma generation (§9 module 4); cross-document View Transitions portal animation (§6 — degrades to plain navigation here); star-map cluster fan-out (§5.6); AVIF output (currently JPEG+WebP — verify Sharp AVIF support before enabling).
