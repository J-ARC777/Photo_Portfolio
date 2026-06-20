import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Separate real pages per category (§3.3): real URLs, working back button.
// Dev mode serves any .html by path automatically; this input map is for `build`.
const root = __dirname;
// Project site lives at https://j-arc777.github.io/Photo_Portfolio/ → assets need that
// base prefix in a production build. Dev stays at '/' so localhost URLs stay clean.
export default defineConfig(({ command }) => ({
  root,
  base: command === 'build' ? '/Photo_Portfolio/' : '/',
  build: {
    outDir: resolve(root, '..', 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        splash: resolve(root, 'index.html'),
        astro: resolve(root, 'astro.html'),
        travel: resolve(root, 'travel.html'),
        landscape: resolve(root, 'landscape.html'),
        nature: resolve(root, 'nature.html'),
        film: resolve(root, 'film.html'),
        otherworlds: resolve(root, 'other-worlds.html'),
        license: resolve(root, 'license.html'),
      },
    },
  },
}));
