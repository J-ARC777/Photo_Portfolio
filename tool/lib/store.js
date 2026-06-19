// Storage abstraction (§1.4) — the hook that makes the Phase-2 CDN a config change, not a
// rewrite. ALL master-rendition writes go through a Store. The manifest records the
// returned abstract URI (e.g. masters://<slug>/<variant>.<ext>), NEVER an absolute path,
// so a location change (local → R2) only rewrites URIs.
//
// Display/web renditions are NOT routed through here — they live in the deployed repo and
// are handled by derive.js. Only masters (print-master / starless / raw-scan / variants)
// use the Store, and they are never shipped to the browser in Phase 1.

import sharp from 'sharp';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MASTERS_DIR, STORE } from './config.js';

// extension from a rendition's source mime/format, defaulting sensibly.
function extFor(rendition) {
  const fmt = (rendition.format || rendition.ext || '').toLowerCase().replace(/^\./, '');
  if (fmt) return fmt === 'jpeg' ? 'jpg' : fmt;
  return 'bin';
}

// safe filename fragment for a free-text variant label.
function safeVariant(variant, role) {
  const base = String(variant || role || 'master')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'master';
}

// LocalStore (implement now) — writes to MASTERS_DIR/<slug>/<variant>.<ext>, returns a
// stable abstract URI. The physical root (MASTERS_DIR) is swappable via config without
// touching anything recorded in the manifest.
export const LocalStore = {
  kind: 'local',

  async put(slug, rendition, fileBuffer) {
    const variant = safeVariant(rendition.variant, rendition.role);
    const ext = extFor(rendition);
    const fileName = `${variant}.${ext}`;
    const outDir = join(MASTERS_DIR, slug);
    await mkdir(outDir, { recursive: true });
    const absPath = join(outDir, fileName);
    await writeFile(absPath, fileBuffer);

    // best-effort dimensions/bytes for the manifest entry
    let dimensions = rendition.dimensions || null;
    if (!dimensions) {
      try {
        const m = await sharp(fileBuffer, { failOn: 'none' }).metadata();
        if (m.width && m.height) dimensions = { width: m.width, height: m.height };
      } catch { /* non-image master (e.g. raw-scan container) — leave null */ }
    }
    const { size: bytes } = await stat(absPath);

    return {
      uri: `masters://${slug}/${fileName}`, // abstract, location-independent (§1.4)
      bytes,
      dimensions,
    };
  },

  // Resolve an abstract URI back to a local absolute path (for backup tooling / a future
  // migration job). Not used to serve anything to the browser.
  resolveLocal(uri) {
    const m = /^masters:\/\/(.+)$/.exec(uri || '');
    if (!m) return null;
    return resolve(MASTERS_DIR, m[1]);
  },
};

// R2Store (Phase-2 hook — STUBBED). Same interface as LocalStore. Phase 2 is:
//   1. implement put() to upload to Cloudflare R2 (or chosen CDN) and return the object URL,
//   2. implement getSignedUrl() for gated delivery of a *purchased* master,
//   3. flip STORE=r2, run the one-time migration (below).
export const R2Store = {
  kind: 'r2',

  async put(/* slug, rendition, fileBuffer */) {
    throw new Error('R2Store not implemented (Phase 2). Set STORE=local for now.');
  },

  // eslint-disable-next-line no-unused-vars
  async getSignedUrl(/* uri */) {
    throw new Error('R2Store.getSignedUrl not implemented (Phase 2 gated delivery).');
  },
};

// MIGRATION (document, don't build) — local → R2, one time:
//   for each work, for each master rendition:
//     buf = read LocalStore.resolveLocal(r.uri)
//     newUri = await R2Store.put(work.slug, r, buf)
//     r.uri = newUri
//   writeManifest(m)   // atomic
// Works because slugs are permanent and the manifest references by URI, not by path.

export function getStore() {
  switch (STORE) {
    case 'local': return LocalStore;
    case 'r2': return R2Store;
    default: throw new Error(`Unknown STORE backend: ${STORE}`);
  }
}
