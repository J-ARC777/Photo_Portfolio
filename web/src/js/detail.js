// Detail band builder (§5.5) — shared by the grid template and the Astro map.
// Builds a self-contained "composite = image + info panel" element with the
// photo-derived accent applied locally (single-work view, §4.1).

import { metaParts, displaySrc } from './manifest.js';
import { openImageLightbox } from './lightbox.js';

const ICON = {
  prev: '‹',
  next: '›',
  close: '✕',
};

// onStep(dir) and onClose() are supplied by the host page.
export function buildDetail(work, { onPrev, onNext, onClose }) {
  const portrait = (work.nativeAspect ?? 1) < 1;
  const band = el('div', `detail ${portrait ? 'portrait' : 'landscape'}`);
  // single-work accent override (clamped at build, §4.1)
  if (work.accent) band.style.setProperty('--accent', work.accent);

  // ---- image side ----
  const imgSide = el('div', 'detail__img');
  const src = displaySrc(work);
  if (src) {
    const img = el('img');
    img.src = src;
    img.alt = work.alt || work.caption || work.title || 'photograph';
    img.style.background = work.accent || 'var(--surface)';
    img.style.cursor = 'zoom-in';
    img.title = 'Click to view full size';
    img.addEventListener('click', () => openImageLightbox(src, img.alt));
    imgSide.appendChild(img);
  } else {
    imgSide.appendChild(swatch(work));
  }

  // close + stepping controls
  const close = el('button', 'btn detail__close', ICON.close);
  close.setAttribute('aria-label', 'Close detail');
  close.addEventListener('click', onClose);
  imgSide.appendChild(close);

  const nav = el('div', 'detail__nav');
  const prev = stepBtn(ICON.prev, 'Previous image', onPrev);
  const next = stepBtn(ICON.next, 'Next image', onNext);
  nav.append(prev, next);
  imgSide.appendChild(nav);

  // ---- info side (four zones, §5.5.1) ----
  const info = el('div', 'detail__info');

  // 1. Identity
  const identity = el('div');
  identity.appendChild(el('h2', 'detail__title', work.title || 'Untitled'));
  if (work.caption) identity.appendChild(el('p', 'detail__caption', work.caption));
  const locDate = [work.location, work.date].filter(Boolean).join(' · ');
  if (locDate) identity.appendChild(el('p', 'detail__loc', locDate));
  info.appendChild(identity);

  // 2. Viewing tools — lazy-loaded 3D proof room (§5.5.2); kept off the resting panel
  const toolsBtn = el('button', 'btn detail__tools-btn', 'Wall Viewer →');
  let proofOpen = false;
  let proofEl = null;
  let _buildProof = null;
  toolsBtn.addEventListener('click', async () => {
    proofOpen = !proofOpen;
    if (proofOpen) {
      if (!_buildProof) ({ buildProof: _buildProof } = await import('./proof.js'));
      proofEl = _buildProof(work);
      toolsBtn.after(proofEl);
      toolsBtn.textContent = 'Wall Viewer ↓';
    } else {
      proofEl?._destroy?.();
      proofEl?.remove();
      proofEl = null;
      toolsBtn.textContent = 'Wall Viewer →';
    }
  });
  info.appendChild(toolsBtn);

  // 3. Commerce zone — Phase 2 stub, present but disabled (§5.5.1 / §10)
  const commerce = el('div', 'detail__commerce');
  const prints = el('button', 'btn', 'View prints');
  prints.disabled = true;
  prints.title = 'Prints — coming soon (Phase 2)';
  commerce.appendChild(prints);
  if (work.shadowDensity != null && work.shadowDensity > 0.6) {
    // dark-image print warning, auto-flagged (§5.5.2)
    commerce.appendChild(
      el('p', 'detail__warn',
        'Shadow-rich image — prints reflect rather than emit, so deep tones read darker on paper.')
    );
  }
  info.appendChild(commerce);

  // 4. Metadata — flowing inline list, omitted silently if absent (§5.5.1)
  const parts = metaParts(work);
  if (parts.length) {
    const meta = el('div', 'detail__meta');
    parts.forEach((p, i) => {
      if (i) meta.appendChild(el('span', 'sep', '·'));
      meta.appendChild(document.createTextNode(p));
    });
    info.appendChild(meta);
  }

  band.append(imgSide, info);
  return band;
}


function stepBtn(glyph, label, handler) {
  const b = el('button', 'detail__step', glyph);
  b.setAttribute('aria-label', label);
  b.addEventListener('click', handler);
  return b;
}

function swatch(work) {
  const d = el('div');
  d.style.cssText = `width:100%;aspect-ratio:${(work.nativeAspect ?? 1)};background:${work.accent || 'var(--elevated)'};`;
  return d;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
