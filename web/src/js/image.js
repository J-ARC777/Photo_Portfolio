// Responsive image construction. The derive pipeline emits a responsive WebP set + a
// single JPEG fallback (see tool/lib/derive.js). We serve WebP to the ~99% of browsers
// that support it via <picture>, falling through to the one JPEG otherwise.

// Build a <picture> for a work. Returns { picture, img } so the caller can set alt,
// background (letterbox fill), click handlers, etc. on the inner <img>.
export function buildPicture(work, { sizes = '100vw', loading = 'lazy' } = {}) {
  const web = work.web || {};
  if (!web.src) return null;

  const picture = document.createElement('picture');
  if (web.srcsetWebp) {
    const source = document.createElement('source');
    source.type = 'image/webp';
    source.srcset = web.srcsetWebp;
    source.sizes = sizes;
    picture.appendChild(source);
  }
  const img = document.createElement('img');
  img.src = web.src;            // JPEG fallback / canonical
  img.loading = loading;
  picture.appendChild(img);
  return { picture, img };
}

// Largest available rendition, for the full-screen lightbox. Prefers the biggest WebP;
// falls back to the canonical JPEG.
export function largestSrc(work) {
  const web = work.web || {};
  return web.largest || web.src || null;
}
