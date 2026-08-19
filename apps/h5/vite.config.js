import { defineConfig } from 'vite';

// Unimatcha H5 client. Tailwind is loaded via CDN in index.html,
// so Vite only bundles the ES modules under src/ and copies public/.
export default defineConfig({
  base: '/',
  server: { port: 3002, host: true },
  preview: { port: 3002, host: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
