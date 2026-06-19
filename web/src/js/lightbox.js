// Full-screen image zoom — stage 2 of the two-stage image interaction.
// Opened by clicking the image inside the detail view.
// Stage 1 (detail view) is handled by grid.js / astro.js + detail.js.

let _overlay = null;
let _keydown = null;

export function openImageLightbox(src, alt) {
  _teardown();

  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) _teardown(); });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn lightbox__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', _teardown);

  const imgArea = document.createElement('div');
  imgArea.className = 'lightbox__img';
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || '';
  imgArea.appendChild(img);

  overlay.append(closeBtn, imgArea);
  document.body.appendChild(overlay);

  _keydown = (e) => { if (e.key === 'Escape') _teardown(); };
  document.addEventListener('keydown', _keydown);
  _overlay = overlay;
}

function _teardown() {
  if (_overlay) { _overlay.remove(); _overlay = null; }
  if (_keydown) { document.removeEventListener('keydown', _keydown); _keydown = null; }
}
