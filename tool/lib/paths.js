import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');
export const WEB_PUBLIC = resolve(ROOT, 'web', 'public');
export const DATA_DIR = resolve(WEB_PUBLIC, 'data');
export const WORKS_DIR = resolve(WEB_PUBLIC, 'works');
export const MANIFEST_PATH = resolve(DATA_DIR, 'manifest.json');

export const CATEGORIES = ['Astro', 'Travel', 'Landscape', 'Nature', 'Film'];
