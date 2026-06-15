// Manifest store (§8). The tool owns validation and writes ATOMICALLY
// (write-temp-then-rename) so a static build never reads a half-written file.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { CATEGORIES, DATA_DIR, MANIFEST_PATH } from './paths.js';

export async function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return { version: 1, categories: CATEGORIES, works: [] };
  }
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
}

export async function writeManifest(manifest) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${MANIFEST_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(manifest, null, 2));
  await rename(tmp, MANIFEST_PATH); // atomic swap
}

// slug: stable, permanent ID — generated once on creation, never auto-changed (§8)
export function makeSlug(title, existing) {
  const base = String(title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'work';
  let slug = base;
  let n = 2;
  const taken = new Set(existing.map((w) => w.slug));
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export function nextSequence(works, category) {
  const inCat = works.filter((w) => w.category === category);
  return inCat.length ? Math.max(...inCat.map((w) => w.sequence ?? 0)) + 1 : 0;
}

// move a work up/down within its category, renumbering sequences
export function reorder(manifest, slug, dir) {
  const w = manifest.works.find((x) => x.slug === slug);
  if (!w) return manifest;
  const peers = manifest.works
    .filter((x) => x.category === w.category)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const i = peers.indexOf(w);
  const j = i + dir;
  if (j < 0 || j >= peers.length) return manifest;
  [peers[i], peers[j]] = [peers[j], peers[i]];
  peers.forEach((p, idx) => { p.sequence = idx; });
  return manifest;
}
