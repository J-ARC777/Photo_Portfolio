// CLI: populate every empty category with placeholder works.
//   npm run placeholders            (fill empty categories)
//   npm run placeholders -- --force (re-fill all, even non-empty)
import { readManifest, writeManifest } from './lib/manifest.js';
import { fillAll } from './lib/placeholder.js';

const force = process.argv.includes('--force');
const manifest = await readManifest();
console.log(`Generating placeholders (force=${force})…`);
const added = await fillAll(manifest, { force });
await writeManifest(manifest);
console.log(`Done. Added ${added.length} works. Total now: ${manifest.works.length}.`);
if (added.length) console.log(added.join(', '));
