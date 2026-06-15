// Detail band builder (§5.5) — shared by the grid template and the Astro map.
// Builds a self-contained "composite = image + info panel" element with the
// photo-derived accent applied locally (single-work view, §4.1).

import { metaParts, displaySrc } from './manifest.js';

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

  // 2. Viewing tools — one click away (proofing room), kept off the resting panel
  const toolsBtn = el('button', 'btn detail__tools-btn', 'Viewing tools →');
  let proofOpen = false;
  let proofEl = null;
  toolsBtn.addEventListener('click', () => {
    proofOpen = !proofOpen;
    if (proofOpen) {
      proofEl = buildProof(work);
      toolsBtn.after(proofEl);
      toolsBtn.textContent = 'Viewing tools ↓';
    } else {
      proofEl?.remove();
      toolsBtn.textContent = 'Viewing tools →';
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

// procedural material textures (§5.5.2 texture toggle). Real-ish PBR surface:
// a tooth/grain layer (the roughness) blended over the print, plus a UNIFORM
// ambient sheen (the highlight the tooth catches) — never directional (§7).
const MATERIALS = {
  'Fine-art rag': { tooth: turbulence(0.9, 3, 'fractalNoise'), toothOpacity: 0.16, sheen: 0.10, blend: 'soft-light', size: 180 },
  'Cotton canvas': { tooth: weave(), toothOpacity: 0.32, sheen: 0.18, blend: 'overlay', size: 26 },
  'Photo poster': { tooth: turbulence(2.4, 2, 'fractalNoise'), toothOpacity: 0.07, sheen: 0.26, blend: 'soft-light', size: 120 },
};

function buildProof(work) {
  // Public echo of the proofing workstation (§5.5.2). Light acts on the room;
  // the print brightens/dims + color-shifts UNIFORMLY — never a directional cast.
  const wrap = el('div', 'proof');
  const room = el('div', 'proof__room');
  room.style.background = 'hsl(38 12% 71%)';
  const frame = el('div', 'proof__frame');

  // print stack: image + tooth (roughness) + sheen (uniform ambient highlight)
  const print = el('div', 'proof__print');
  const img = el('img');
  img.src = displaySrc(work) || '';
  img.alt = '';
  const tooth = el('div', 'proof__tooth');
  const sheen = el('div', 'proof__sheen');
  print.append(img, tooth, sheen);
  frame.appendChild(print);
  room.appendChild(frame);

  let roomLevel = 0.85;   // 0..1 ambient brightness, set by day/night
  let material = null;    // null = bare print (no material overlay)

  function applyMaterial() {
    if (!material) {
      tooth.style.opacity = '0';
      sheen.style.opacity = '0';
      return;
    }
    const m = MATERIALS[material];
    tooth.style.backgroundImage = `url("${m.tooth}")`;
    tooth.style.backgroundSize = `${m.size}px ${m.size}px`;
    tooth.style.mixBlendMode = m.blend;
    tooth.style.opacity = String(m.toothOpacity);
    tooth.style.backgroundBlendMode = m.blend;
    // sheen scales with room brightness — a well-lit room catches more tooth sheen
    sheen.style.opacity = String((m.sheen * (0.4 + roomLevel * 0.8)).toFixed(3));
    sheen.style.backgroundImage = `url("${m.tooth}")`;
    sheen.style.backgroundSize = `${m.size}px ${m.size}px`;
  }

  const controls = el('div', 'proof__controls');

  // full RGB wall color (not a single-axis slider)
  const wall = colorRow('Wall color', '#cfcabf', (hex) => { room.style.background = hex; });

  // day/night: ambient level + temperature; print receives it uniformly.
  const day = rangeRow('Day → night', 0, 100, 70, (v) => {
    roomLevel = 0.45 + (v / 100) * 0.55;             // room brightness
    const warm = (1 - v / 100) * 18;                 // warmer toward evening
    img.style.filter = `brightness(${roomLevel.toFixed(2)}) sepia(${warm.toFixed(0)}%)`;
    applyMaterial();
  });

  // texture toggle — paper / canvas / poster (§5.5.2)
  const material_ = materialRow(['None', ...Object.keys(MATERIALS)], (label) => {
    material = label === 'None' ? null : label;
    applyMaterial();
  });

  controls.append(wall, day, material_);
  wrap.append(room, controls);
  // honesty: texture is illustrative, and the whole tool is preview-only
  wrap.appendChild(el('p', 'proof__disclaimer', 'Texture preview — illustrative, not a physically-accurate proof.'));
  wrap.appendChild(
    el('p', 'proof__disclaimer',
      'Preview / approximation — not a color-managed proof. Uncalibrated displays vary.')
  );
  return wrap;
}

function materialRow(options, onpick) {
  const wrap = el('label');
  wrap.appendChild(document.createTextNode('Print surface'));
  const seg = el('div', 'proof__seg');
  let active = options[0];
  options.forEach((label) => {
    const b = el('button', 'proof__seg-btn' + (label === active ? ' on' : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => {
      active = label;
      [...seg.children].forEach((c) => c.classList.toggle('on', c === b));
      onpick(label);
    });
    seg.appendChild(b);
  });
  wrap.appendChild(seg);
  return wrap;
}

// --- procedural texture generators → SVG data URIs (the "PBR" maps) ---
function turbulence(freq, octaves, type) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>
    <filter id='n'><feTurbulence type='${type}' baseFrequency='${freq / 100}' numOctaves='${octaves}' stitchTiles='stitch'/>
      <feColorMatrix type='saturate' values='0'/></filter>
    <rect width='160' height='160' filter='url(#n)'/></svg>`;
  return svgUri(svg);
}
function weave() {
  // canvas tooth: crosshatched turbulence stretched in two directions
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'>
    <filter id='w'><feTurbulence type='turbulence' baseFrequency='0.04 0.5' numOctaves='2' stitchTiles='stitch'/>
      <feColorMatrix type='saturate' values='0'/></filter>
    <filter id='w2'><feTurbulence type='turbulence' baseFrequency='0.5 0.04' numOctaves='2' stitchTiles='stitch'/>
      <feColorMatrix type='saturate' values='0'/></filter>
    <rect width='48' height='48' filter='url(#w)' opacity='0.6'/>
    <rect width='48' height='48' filter='url(#w2)' opacity='0.6'/></svg>`;
  return svgUri(svg);
}
function svgUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
}

function colorRow(label, value, oninput) {
  const wrap = el('label', 'proof__colorrow');
  wrap.appendChild(document.createTextNode(label));
  const c = el('input');
  c.type = 'color';
  c.value = value;
  c.addEventListener('input', () => oninput(c.value));
  oninput(value);
  wrap.appendChild(c);
  return wrap;
}

function rangeRow(label, min, max, value, oninput) {
  const wrap = el('label');
  wrap.appendChild(document.createTextNode(label));
  const r = el('input');
  r.type = 'range';
  r.min = min; r.max = max; r.value = value;
  r.addEventListener('input', () => oninput(Number(r.value)));
  oninput(value);
  wrap.appendChild(r);
  return wrap;
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
