import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Separate real pages per category (§3.3): real URLs, working back button.
// Dev mode serves any .html by path automatically; this input map is for `build`.
const root = __dirname;
export default defineConfig({
  root,
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
      },
    },
  },
});
