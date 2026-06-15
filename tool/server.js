// Local content tool (§9) — a small Node server with a web UI that writes to
// local folders + the JSON manifest. No auth, no hosting (deliberately scoped
// out): runs only on your machine. Sharp does the image derivation.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  readManifest, writeManifest, makeSlug, nextSequence, reorder,
} from './lib/manifest.js';
import { deriveWeb } from './lib/derive.js';
import { fillAll, addOne } from './lib/placeholder.js';
import { WORKS_DIR, CATEGORIES } from './lib/paths.js';

const PORT = process.env.PORT || 4321;
const UI = new URL('./ui.html', import.meta.url);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, await readFile(UI), 'text/html');
    }
    if (req.method === 'GET' && url.pathname === '/api/manifest') {
      return json(res, 200, await readManifest());
    }
    if (req.method === 'POST' && url.pathname === '/api/placeholders/fill') {
      const { force } = await body(req);
      const m = await readManifest();
      const added = await fillAll(m, { force: !!force });
      await writeManifest(m);
      return json(res, 200, { added, total: m.works.length });
    }
    if (req.method === 'POST' && url.pathname === '/api/placeholders/add') {
      const { category } = await body(req);
      const m = await readManifest();
      const work = await addOne(m, category);
      await writeManifest(m);
      return json(res, 200, { slug: work.slug });
    }
    // ingest a real upload: { dataUrl, title, category, caption, ...meta }
    if (req.method === 'POST' && url.pathname === '/api/works') {
      const data = await body(req);
      const m = await readManifest();
      const slug = makeSlug(data.title, m.works);
      const buf = dataUrlToBuffer(data.dataUrl);
      const derived = await deriveWeb(buf, slug);
      const work = {
        slug,
        title: data.title || 'Untitled',
        category: data.category || 'Travel',
        caption: data.caption || null,
        sequence: nextSequence(m.works, data.category),
        centerpieceEligible: !!data.centerpieceEligible,
        alt: data.alt || data.title || 'photograph',
        cameraBody: data.cameraBody || null,
        lens: data.lens || null,
        focalLength: data.focalLength || null,
        aperture: data.aperture || null,
        shutter: data.shutter || null,
        iso: data.iso ? Number(data.iso) : null,
        filmStock: data.filmStock || null,
        date: data.date || null,
        location: data.location || null,
        nativeAspect: derived.nativeAspect,
        isPanorama: !!data.isPanorama,
        shadowDensity: derived.shadowDensity,
        accent: derived.accent,
        ...(data.category === 'Astro'
          ? { raCenter: num(data.raCenter), decCenter: num(data.decCenter), rotation: 0, angularSize: num(data.angularSize) }
          : {}),
        commerce: { printSizes: [], substrates: [], pricePer: {}, edition: null, printAdvisory: null },
        renditions: [{ role: 'display', colorSpace: 'srgb', profile: null, path: derived.web.src, dimensions: derived.dimensions }],
        web: derived.web,
      };
      m.works.push(work);
      await writeManifest(m);
      return json(res, 200, { slug, accent: derived.accent, shadowDensity: derived.shadowDensity });
    }
    // edit metadata / curation fields
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/works/')) {
      const slug = decodeURIComponent(url.pathname.split('/').pop());
      const patch = await body(req);
      const m = await readManifest();
      const w = m.works.find((x) => x.slug === slug);
      if (!w) return json(res, 404, { error: 'not found' });
      // slug is permanent and never auto-changed (§8) — ignore any slug in patch
      delete patch.slug;
      Object.assign(w, patch);
      await writeManifest(m);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/reorder') {
      const { slug, dir } = await body(req);
      const m = await readManifest();
      reorder(m, slug, dir);
      await writeManifest(m);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/works/')) {
      const slug = decodeURIComponent(url.pathname.split('/').pop());
      const m = await readManifest();
      m.works = m.works.filter((x) => x.slug !== slug);
      await writeManifest(m);
      await rm(join(WORKS_DIR, slug), { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }
    send(res, 404, 'Not found', 'text/plain');
  } catch (err) {
    console.error(err);
    json(res, 500, { error: String(err && err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Content tool → http://localhost:${PORT}`);
  console.log(`  Categories: ${CATEGORIES.join(', ')}`);
  console.log(`  Writes to web/public/{data/manifest.json, works/}\n`);
});

// --- helpers ---
function send(res, code, payload, type) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(payload);
}
function json(res, code, obj) {
  send(res, code, JSON.stringify(obj), 'application/json');
}
function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function dataUrlToBuffer(dataUrl) {
  const m = /^data:[^;]+;base64,(.*)$/s.exec(dataUrl || '');
  if (!m) throw new Error('expected a base64 data URL for the image');
  return Buffer.from(m[1], 'base64');
}
function num(v) { return v === '' || v == null ? null : Number(v); }
