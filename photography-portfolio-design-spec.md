# Photography Portfolio — Design & Architecture Specification

**Version:** 1.0 (draft)
**Status:** Phase 1 (front-end + content tool) fully designed; Phase 2 (commerce) stubbed.
**Author:** Jeremy Ivan
**Purpose:** Records the design and interaction decisions for the portfolio + print-sales site so they survive into implementation (by hand or via Claude Code). This is a *design/architecture* spec, not a visual style guide — it does not contain a final spacing scale, icon set, or pixel-level measurements, because those were not decided. Where something is genuinely undecided it is marked **[OPEN]** rather than invented.

---

## 1. How to read this document

Sections 2–3 are the governing intent (philosophy + IA). Section 4 is the visual language (tokens). Section 5 specs each screen. Section 6 is the motion/transition system. Section 7 lists the cross-cutting constraints that recur everywhere. Sections 8–10 cover data, the content tool, and commerce stubs. Section 11 collects every **[OPEN]** decision in one place.

When a future decision is ambiguous, resolve it against **Section 2** — the philosophy is the tie-breaker.

---

## 2. Design philosophy (the tie-breaker)

A single principle ran through every decision and should govern future ones:

1. **A stable, honest environment.** Nothing hides, scrims, reshuffles, or rearranges unexpectedly. The layout is a stable map; focused states are temporary lenses over it. Because the substrate doesn't move, explicit wayfinding aids are mostly unnecessary — the world itself is the breadcrumb.
2. **Honesty over realism.** The site represents *what is true* (a photograph's real color, an image's true sky position, how a print actually reads in a room) rather than flattering the work. Simulations represent **viewing conditions**, never alterations of the artwork. A control must never imply more precision than it has.
3. **Restraint as confidence.** The minimum chrome, motion, and color that keeps structure and interactivity legible — nothing more. Every time the project shed complexity or realism for restraint, it got both cleaner to build and truer to intent. When in doubt, do less.

A practical corollary used throughout: **absence is silent, never marked.** Any field without a value (caption, metadata, price) is omitted cleanly — never shown empty, placeholdered, or guessed.

---

## 3. Information architecture

### 3.1 Structure
- **Splash** (landing) → **five categories** → **category grid** → **detail view**.
- Categories: **Astro, Travel, Landscape, Nature, Film.**
- **Astro is the one true map** (a planetarium star view); the other four are justified grids. Astro also offers a plain grid view via a toggle.

### 3.2 The map metaphor
The site should feel like exploring a map: the whole is available, exploration is continuous, and focusing on one point lets you explore related points **without returning to an overview**. This is implemented as **lateral navigation** (peer-to-peer movement) rather than in-out modal navigation. Canonical frame: Shneiderman's Visual Information-Seeking Mantra (overview → zoom/filter → details-on-demand), extended toward focus+context (Furnas) — context stays visible while one region is emphasized.

### 3.3 Page model
- **Separate real pages** per category (real URLs, working back button, light per-page payloads). WebGL loads only on the Astro page and the splash.
- **Two page templates total:** Astro (sky map + grid) and the shared grid template (the other four). The four differ only in content.
- **Wrap behavior:** category sequence wraps **through the splash** (splash is the home base in the loop), not category-to-category directly. The splash is the only page that is *only ever a destination* — it has no "back," because it is the root.
- **Category sequence order:** 1D (a line, not a 2D map — arbitrary 2D adjacency would add cognitive load without encoding meaning). **[OPEN]** what determines the order (curatorial vs. alphabetical).

---

## 4. Visual language

### 4.1 Color
Base canvas is **dark charcoal** (the "museum wall," lifted from near-black so it reads as "gallery at dusk," not "void"). The fixed palette is the neutrals; **color is supplied by the photographs**, not the chrome.

| Role | Value |
|---|---|
| Base | `#17171B` |
| Surface | `#212126` |
| Elevated | `#2B2B31` |
| Hairline | `rgba(255,255,255,0.11)` |
| Text primary | `#EDECEA` |
| Text secondary | `#C8C7C2` |
| Text tertiary / metadata | `#95948F` |
| Fixed accent ("Starlight amber") | `#E0A94E` |

**Color rules:**
- **Multi-image views** (splash, category grids, nav bars) are **fully neutral** — no accent.
- **Single-work views** (detail band, open state) carry **one accent, auto-extracted from that photo** — sample a *vibrant/characteristic* swatch (not the dominant/most-frequent color, which is usually a muddy background), then **clamp** luminance/saturation to a legibility floor on charcoal. The photo chooses the hue; the system guarantees contrast.
- The cross-site "gradient of colors" emerges naturally from browsing work to work — authored by the photographs, never invented by the UI.
- **Fixed accent (amber)** is the interaction/focus color in neutral views; the photo-derived accent temporarily overrides it in single-work views.
- Accent scope (always): active states, focus rings, the count/label, hairlines — **never** large fills or body text.
- **Coupled pair:** base lightness and the lightest text tier move together — if the base shifts, re-check the tertiary tier for WCAG AA.
- Focus ring must meet ≥3:1 non-text contrast against the base; amber clears this on the current charcoal.

### 4.2 Typography
Two roles, no third typeface. Hierarchy comes from *range within two fonts*, not more fonts.

- **Display / identity:** **Space Grotesk**, weight 500, **uppercase** — used for the name, category titles, photo titles (photo titles are treated as **chrome**), and structural labels. Carries the site's only "voice" (technical/instrument character), so keep it to structural moments; one voice used sparingly is louder than a voice everywhere.
- **Body / metadata:** **IBM Plex Sans**, weight 400, **sentence case** — captions and metadata. Never tracked wide, never caps.
- **Tracking scales inversely with size:** large title ≈ `.10–.12em`, category nav ≈ `.16–.18em`, small labels more. A rule, not one value.
- Weights limited to 400/500.
- **[OPEN]** the name's treatment (caps "brand" vs. sentence-case "person").

**Performance:** two families × two weights, Latin subset, `font-display: swap`, preload only the splash's above-fold cut.

### 4.3 Chrome
**Hybrid** — tone and space separate large regions; **hairlines appear only where they do work.** Governing test for the spec (so it can't drift back to over-bordering):

> A border must justify itself by separating a **photograph from UI**, or **chrome from content** — otherwise it's tone and space.

- Hairline lives at: the **image/info seam** in the detail view (protects the photo's edge from bleeding into text), and the **boundary nav bar's edge** (so it doesn't read as another grid row).
- **Controls:** quiet at rest (text/icon only, near-invisible chrome); **edge appears on hover/focus** (amber ring on buttons, amber underline on links). The amber focus state doubles as the WCAG focus indicator.
- Single-sided borders (e.g., the seam) use no border radius on that side.

### 4.4 Motion character
Principles locked; exact values **[OPEN]**.
- All motion is **damped, eased, and (where applicable) auto-recentering** — never free/unbounded.
- One coherent motion language across the site (see §6).
- `prefers-reduced-motion` is honored everywhere: animations degrade to instant/fade/static.
- **[OPEN]** specific easing curves and durations (the "one hand" feel) — to be defined in build.

---

## 5. Screens

### 5.1 Splash (landing)
- **Composition (back to front):** starless photographic plate (rear, **the LCP element**, loads first) → synthetic 3D starfield (middle, WebGL) → UI: title, "Enter the sky map" CTA, category controls (front).
- The starfield is **synthetic and decorative**, explicitly *not* the real plate-solved sky (the splash and the Astro map are **separate engines** — separation protects per-page weight and keeps the gimmick honestly a gimmick). Stars are positioned in **continuous 3D** (not discrete planes) for volumetric parallax; depth kept a **thin slab**, camera excursion small.
- **Motion:** scroll drives vertical progression; mouse/touch-drag drives a small **orthogonal, damped, auto-recentering tilt** (parallax). These are orthogonal *roles* (one moves through the page, one animates a thing you stand before). Touch-drag is permitted (it feeds the same clamped tilt — it is *not* the rejected grabbable orbit); disambiguate scroll-vs-tilt by axis-locking at gesture start; horizontal owns the tilt.
- **Layout:** ~**80/20** — hero occupies ~80vh so a ~20% peek of the category controls sits above the fold (defeats the "false bottom"). Use `dvh`/`svh`, not `100vh`.
- **Astro entry:** the star canvas itself is the Astro gateway (labeled "Astrophotography" + "Enter the sky map"); the four other categories are buttons. (Variant chosen: Astro is a **featured peer** — labeled, two ways in: the canvas and a peer button.)
- **Fallbacks:** loads after the plate paints; `prefers-reduced-motion` → static composite; no cursor on touch is fine (drag still works; idle is still).

### 5.2 Category buttons (on the splash)
- Each button is a **3×3 uniform-crop teaser** (uniform crop is correct *here* — a tiny preview needs the order a rigid grid gives; this is deliberately different from the category page's justified grid). Crop ratio **3:2 landscape** for the button; portraits crop in.
- Center cell is an enlarged **hero**; the 8 surrounds are **ambient** (20–30% visibility, default subtle blur + desaturation).
- **Idle:** the surrounds cross-fade through an auto-generated set (~5–6 for variety); the center cycles through a **small curated subset**. (Per WCAG 2.2.2, any auto-motion >5s needs a pause path — satisfied below.)
- **Hover/focus:** the cycle **pauses immediately** (interaction always wins over animation); center shrinks slightly; surrounds lift toward full visibility and become individually selectable; an "open →" affordance appears.
- **Select:** clicking **any** cell navigates to that category's page with **that image leading** — one gesture, one result, identical on mouse/touch/keyboard, never "click → nothing." No promote-then-confirm step.
- **Count:** a **live** count (e.g., "( 24 )") sets expectations before entry.

### 5.3 Boundary navigation bars (Steam-collection style)
- A **thin, full-width** control at the **top and bottom** of every category page (not the splash). Reuses the splash button's *role* but a different *form* (a bar, not a grid).
- Visual: a few category sample images **fanned behind**, **blurred + desaturated** (backdrop register — keeps the label legible and sidesteps the fidelity concern since a heavily-blurred sample isn't presenting the work); category **name + live count** centered on top.
- **Bottom = next category, top = previous** — bidirectional movement through the 1D sequence from either end of the grid, so a user at the bottom needn't scroll back up.
- Replaces scroll-to-change-category (avoids scroll-hijacking — internal scroll keeps its one honest meaning). The bar is also the **context-clue/peek**: it shows the actual next/previous category, delivering the "stacked sequence" feel as a tangible, clickable object.
- Uses the one shared **portal animation** (§6).

### 5.4 Category grid (the shared template)
- **Justified layout** (Flickr/Google-Photos style): **gutters are constant by construction**; **row height varies** to fill each row's width; within a row, portrait and landscape share the row's height. Mixed native ratios are preserved (no uniform crop). The slight irregular *vertical rhythm* is the accepted trade for completeness + uncropped proportion; the constant gutter supplies the "grid-like" order.
- A tall portrait may occupy roughly two rows' worth of height; that's native justified behavior, not an exception.
- **Last row:** **left-justified** at a natural height (cleanest of the options; avoids ballooning).
- **Row-height clamp:** min and max row height (grid-layer clamp) so an all-pano row doesn't collapse to a strip and an all-portrait row doesn't tower.
- **Panoramas:** capped to **16:9 in the grid** (gives the justifier a normal-range aspect; the cell carries a **pano icon** signaling it's a cropped stand-in — honest). Pano detail view is a **separate layout** (see §5.5).
- **Reading order:** standard left-to-right, top-to-bottom (valid *because* justified preserves intact rows). **DOM/source order must match visual order** for keyboard/screen-reader traversal.

### 5.5 Detail view
- Opens **in place** as a **full-width row of its own** — the detail band is its own row; rows above/below are **pushed apart** to make room (animated "row slider" push, never a jump). Nothing is occluded, nothing reshuffles. This is the "hybrid" of inline + centered: the band is a **distinct centered band** amid the justified rows (it does not flush-justify, since its height is clamped).
- **Composite = image + info panel.** Info panel width = **1× image width** (≈ at the comfortable text measure of 45–75 chars), placed beside the image. Composite ≈ 2× image width.
- **Sizing invariant: equal longest edge** across orientations (lowest portrait-overflow risk; easy to reason about as a bound). Implemented via **two clamps** whose intersection defines the legal size box: an **info-derived min-height** (tall enough that the info content is legible — the image follows the info's floor) and a **max** (protects against viewport overflow, esp. portraits).
- **Native aspect always restored** in the detail image — the grid's crop is a preview framing and never touches the presented work. (Fidelity line.)
- **Orientation flip:** since the info panel mirrors the image's aspect, its **internal layout flexes** — landscape (wide/short) lays out horizontally; portrait (tall/narrow) stacks vertically.
- **Panorama detail:** does **not** use 1×-beside-1×. Instead: a 16:9 preview stacked over a **drag-to-pan strip** (revealing the true width), with the info box sized to the *combined* stacked height (respecting min info size). Scoped as the one detail-view exception.
- **Stepping:** left/right arrows step in reading order (grid view). **No tether** to the origin cell — reversibility is already covered (you opened from a cell, back returns there, and the grid never changed, so the image is still where it was). The band is self-contained while open.
- **Surround treatment:** other images stay **full-strength** (no dim/scale-down — bigness alone is the focus signal; dimming would reintroduce the rejected modal scrim). **[Held]** an optional barely-perceptible desaturation was considered and defaulted **off**.

#### 5.5.1 Info panel anatomy (four zones, top→bottom)
1. **Identity** — title (always present; Space Grotesk caps, chrome), short caption (Plex), optional location/date.
2. **Viewing tools** — a single click-away "second context" (see §5.5.2); not on the resting panel directly.
3. **Commerce zone** — Phase 2; present as a disabled "View prints" affordance now, with the data shape reserved (see §10).
4. **Metadata** — capture details, rendered as a **flowing inline list** (`value · value · value`), each field shown only if present, omitted silently if not (no placeholders, no "unknown"). Fields: camera body, lens, focal length, aperture, shutter, ISO, **film stock**, date, location. (Film scans carry little auto-EXIF; film stock etc. are manually entered in the content tool.) Astro adds the plate-solve fields.

#### 5.5.2 Viewing tools — "second context" (one click from the calm detail view)
A **proofing room** the buyer steps into; the public echo of the author's proofing workstation (§9). Honest-by-design; treated as a **point of pride**, not hidden utilities — but kept *off* the resting panel so the default view stays calm.

Contents:
- **Room ambience simulation** — a configurable **wall color** behind a **framed print**, plus a **day/night control** that ranges the room's ambient **level and temperature** (bright-cool daylight → dim-warm evening). **Fixed camera.** Scene scope kept **simple** (wall color + day/night ambience; no props/window geometry) to avoid the uncanny valley.
- **Critical fidelity rule:** light acts on the **room**; it reaches the **print uniformly** (color/level shift only) — **never** a directional cast or gradient across the artwork's surface. (Directional relighting of the work = misrepresentation for a sale; explicitly forbidden.) Room light *level* may range widely (well-lit sunny rooms welcome); the print just brightens/dims and color-shifts uniformly.
- **White-balance / color-temperature** — the ambient color shift (a cousin of soft-proofing).
- **Brightness as "room brightness"** — framed as a *viewing-condition* sim, not image editing. The buyer may also **toggle between renditions the author created** (e.g., screen version vs. gamma-corrected print version). The real gamma correction happens **offline by the author**, with judgment; the slider is preview only.
- **Texture toggle** — poster / canvas / fine-art, as a **subtle, illustrative** overlay (low-opacity weave/tooth catching only uniform ambient sheen). Labeled "texture preview — illustrative," never a physically-accurate proof.
- **Dark-image print warning** — an **active, auto-flagged per-image note** in the print area (and demonstrable in the dim-room setting). Screens are emissive, prints reflective, so shadow-rich images render darker on paper. Flagged automatically from a luminance/histogram check at upload (`shadowDensity`), surfaced only when warranted. This turns a known disillusionment risk into a trust signal.
- **Disclaimer obligation:** any control that changes how the image *appears* must state "preview/approximation — not a color-managed proof." Non-negotiable; it's what keeps the tools honest (uncalibrated displays vary).

### 5.6 Astro star map (the centerpiece)
A **fixed planetarium view** — the viewer stands at Earth's center; the camera **rotates in place** (pan/tilt), it does **not fly/translate**. This scope choice dissolves the open-3D wayfinding problem: there's always a canonical orientation to return to.

- **Positions:** images are pinned at their **true plate-solved sky coordinates** (RA/Dec, rotation, scale) on the celestial sphere; stars are placed by angular position. From a single fixed viewpoint only angular positions are visible, so **stars and images are both angular-on-the-sphere** (no parallax/3D-distance needed; star brightness/size may vary by real magnitude for honest realism).
- **The image *is* the marker** — the actual photograph sits at its true position, always visible. No nodes, no reveal-on-hover.
- **Zoom:** magnification (narrowing field of view) with a slight **blur on scale-up** for anti-aliasing. The only reset is **reset-zoom** (no full reset needed given the fixed view).
- **Overlap (the core star-map problem):** images in tight regions **cluster into one badge** that **fans/expands on zoom or tap**. The badge must **honestly indicate count**. Clustering is driven by angular proximity (free from plate-solve data). Fanned images are **displaced for readability** — a subtle cue should indicate fanned ≠ exact position; collapsing restores truth. **[OPEN]** exact fan geometry (spiral vs. arc).
- **Overlays:** **none** — stars + your images only, no constellation lines/labels (purist/honest; orientation rests on the real star pattern, appropriate for an astro audience). A deliberate forfeit, not an oversight.
- **Opening an image:** reuses the **grid's detail band** (full-row, longest-edge, info panel, amber focus) — major consistency win. In the sky, stepping with the arrows **rotates the camera to the next image's true position** (a smooth, damped slew; cut/cross-fade under reduced-motion). The view and content stay locked together (honest) and the slew doubles as wayfinding.
- **Grid toggle:** a control at the top of the window switches to a **pure grid view** of the astro images (inherits all standard grid stepping). Astro thus offers both representations.
- **Entry:** land on a **(curated-weighted) random image** and rotate the camera to it, so you always enter pointed at something.
- **Motion at rest:** **fully still**; motion only on input (pan, zoom, arrow-step). Stillness keeps the meaningful camera slew legible and sidesteps the auto-motion accessibility tax. (Honesty over realism: a still map you read, not a fake rotating sphere.)

---

## 6. Motion & transition system

- **One portal animation** for all major transitions: splash→category, category→category (via the boundary bars), and the button→page open/close. Implemented as an **expanding "window" onto an already-correctly-sized page** (not a whole-page scale, which reads dated): the clicked hero image is the **shared element**; the window opens around it; reversing shrinks it back into its slot.
- Powered by the **cross-document View Transitions API** — animations layered over **ordinary navigations**, preserving real pages, URLs, back button, and light payloads. It is *not* literal co-resident 3D pages (that would torch per-page weight). The "slide/3D-space feel" is achieved as a transition over a real navigation, not co-presence.
- **Detail open/close:** the row-push (band opens its own row, rows slide apart).
- **Fallbacks (mandatory):** no View-Transitions support → instant navigation (graceful, nothing breaks). `prefers-reduced-motion` → plain fade/cut instead of slide/scale/slew.
- **[OPEN]** whether category→category should eventually be a *subtle variant* of the portal (traverse vs. descend), or stay identical (currently: identical).

---

## 7. Cross-cutting constraints (apply everywhere)

- **Performance / LCP-first:** the static photographic content paints first; all WebGL (splash starfield, Astro map) and heavy JS loads **after** LCP. Set a performance budget with hard limits. Image pipeline is the backbone: responsive `srcset`, AVIF/WebP, blur-up placeholders, reserve space to avoid CLS.
- **Reduced motion:** `prefers-reduced-motion` honored on every animated element (parallax, cycles, transitions, camera slew, day/night) → static/fade.
- **Accessibility (WCAG touchpoints):** alt text on all images (1.1.1); auto-motion >5s pausable (2.2.2 — satisfied by pause-on-interaction); visible focus indicator everywhere (the amber ring, ≥3:1 non-text contrast); text tiers meet AA against the base; caps reserved for short labels (never body); DOM order matches visual order.
- **Fidelity line:** the *presented* photograph is never cropped, relit directionally, or altered. Crops are preview framings only; simulations alter *viewing conditions*, not the work; any apparent-change control carries the preview disclaimer.
- **Touch/mobile:** cursor-only effects (hover, cursor-parallax) degrade gracefully; touch-drag feeds the splash tilt; avoid the gyroscope (permission-gated/finicky on iOS); use `dvh`/`svh`.
- **Honesty seams:** synthetic splash stars ≠ real sky; fanned cluster images ≠ exact position; texture/room sims are illustrative; print proof is authored offline. Each labeled where it appears.

---

## 8. Data model

**Storage:** **JSON manifest + folders** (not SQLite). Rationale: the consumer is a static build that wants plain data files; the editor is solo; JSON is human-readable, git-diffable, and hand-inspectable. The **tool owns validation** and writes **atomically** (write-temp-then-rename).

**Two-tier schema — Work and Renditions** (one piece of content is a *work* with multiple file renditions for different purposes; this is the photography→commerce handoff and avoids a later migration):

```
Work {
  slug                // stable, permanent ID; generated once on creation, NEVER auto-changed on edit
                       // (it lands in URLs and Phase-2 order records)
  title               // chrome (Space Grotesk caps)
  category            // Astro | Travel | Landscape | Nature | Film
  caption             // optional
  sequence            // order within category
  centerpieceEligible // curation flag (for button hero rotation, random-entry weighting)

  // capture metadata — all optional/nullable; omitted silently in UI if absent
  cameraBody, lens, focalLength, aperture, shutter, iso, filmStock, date, location

  // display/layout
  nativeAspect        // derivable from file
  isPanorama          // bool → 16:9 grid crop + pano icon + special detail layout
  panoCropRegion      // the 16:9 framing for the grid cell
  shadowDensity       // auto-flagged at upload (luminance/histogram) → dark-print warning

  // astro (when category = Astro)
  raCenter, decCenter, rotation, angularSize (or pixelScale+dims), parity

  // accent (single-work views)
  // accent is auto-extracted at build (vibrant swatch, clamped) — may be cached per work

  renditions: [ Rendition ]

  // commerce — Phase 2 stubs, reserved now (see §10)
  commerce { printSizes[], substrates[], pricePer{size,substrate}, edition{type, number, total},
             printAdvisory /* dark-image note, recommended paper */ }
}

Rendition {
  role        // display | print-master | print-proof(gamma-corrected) | starless | raw-scan
  colorSpace  // tagged as-uploaded
  profile     // optional ICC
  path        // relative
  dimensions
}
```

- **Renditions creation:** **mix** — the tool **auto-derives** the web pipeline (responsive AVIF/WebP, blur placeholder, 2:3 button crop, blurred nav-bar samples) **from the display rendition**; **print-master / print-proof / starless** are **uploaded manually**, stored and referenced but never shipped to the browser.
- **Print color:** schema stores **whatever is uploaded, tagged with its color space + profile** (both wide-gamut RGB and literal CMYK supported). Note: most fine-art/photo print is wide-gamut RGB → lab profile at order time; CMYK is usually the lab's conversion target, not the stored master.
- **Folders** mirror works: `/works/<slug>/` holds renditions + derived web assets; the manifest references by relative path.

---

## 9. Content tool (local config tool)

**Form:** a **local web UI** (served from your machine, writes to local folders + the JSON manifest; you redeploy). Chosen over a CLI because the core tasks are **visual judgment** — picking centerpieces, ordering sequences, verifying crops, proofing color — which a CLI can't support. No auth, no hosting, no credential/security surface (deliberately scoped out).

**Stack:** small local Node server + **Sharp** for image derivation (resize/AVIF/WebP/blur). Keeps the tool's language aligned with a JS static front-end. *(Verify current Sharp format/feature support at build time.)*

**Modules:**
1. **Ingest + metadata** — drag-drop upload; auto-pull EXIF where present; **manual entry** for fields film scans lack (film stock, etc.); generate slug once.
2. **Auto-derivation** — produce + preview the web renditions (responsive sizes, placeholder, 2:3 button crop, blurred nav samples); auto-flag `shadowDensity`; extract+clamp the accent.
3. **Curation** — set centerpiece eligibility, within-category sequence (drag to reorder), pano crop region.
4. **Proofing workstation (the authoring version of the viewing tools)** — the **fuller** room/gamma/texture tool: preview room brightness + day/night, simulate paper/canvas/poster, and **generate + attach gamma-corrected print renditions** per substrate. This is the most complex module (live image processing) and is its **own build phase**; the schema reserves room for its outputs now.
5. **Commerce fields** — fill the Phase-2 stubs (dormant UI, live data shape).

**Symmetry:** the proofing workstation (author: *generates*) and the public viewing-tools "second context" (buyer: *previews*) are the same room with two doors — design the proofing interaction once, expose different capabilities to each audience; they may share UI components.

---

## 10. Commerce (Phase 2 — stubbed, not built)

Deferred but **reserved** so Phase 1 doesn't require migration:
- **Build approach:** hybrid — custom static front-end + **embeddable/headless commerce** (e.g., Snipcart/Foxy/Shopify Buy-Buttons) bolted on. Manual fulfillment means the commerce layer needs only cart→checkout→payment→tax + order notification, **no fulfillment API**.
- **Fulfillment:** **pro lab + manual order placement** by the author (fits portfolio-scale volume; keeps quality control; no inventory).
- **Reserved schema fields** (§8): print sizes, substrates, price per size/substrate, edition (open vs. limited; number/total), per-image print advisory.
- **Open Phase-2 questions** (do not resolve now): the specific lab + print color pipeline (RGB+ICC vs. CMYK), pricing, editioning policy, payment/tax (sales-tax nexus), embeddable-commerce fee structure (transaction vs. subscription).

---

## 11. Open questions (consolidated)

- **[OPEN]** Category sequence order (curatorial vs. alphabetical).
- **[OPEN]** Name treatment — caps "brand" vs. sentence-case "person."
- **[OPEN]** Motion easing curves + durations (the unified "one hand" feel).
- **[OPEN]** Spacing/rhythm scale; iconography set (not yet designed).
- **[OPEN]** Cluster **fan geometry** in the star map (spiral vs. arc).
- **[OPEN]** Whether category→category transition becomes a subtle variant of the portal (vs. identical).
- **Held (decided off, revisitable):** surround dim/scale-down in detail view (default off); scene relighting of the artwork (forbidden); literal photoreal room props (out — kept simple); auto-drift in the star map (off); gyroscope tilt on mobile (avoided); a third typeface/Manrope (dropped).
- **Deferred to Phase 2:** all commerce specifics (§10); time-of-day extension of the room sim beyond day/night ambience; any future print-surface material rendering.

---

## 12. Decision-philosophy note (for future you)

Nearly every decision resolved the same way: toward a stable, honest environment and away from anything that hides, scrims, reshuffles, or flatters. When the project chose restraint over realism, it consistently got cleaner to build *and* truer to intent. Use Section 2 as the tie-breaker for anything this document leaves open — it will usually point at the simpler, more honest option.
