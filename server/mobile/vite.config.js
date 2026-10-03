import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** DocGen Mobile is served by the backend under /app/ (its own scope for installation as an app). */
export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  base: '/app/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // One bundle: the service worker caches the whole app on the first visit, so it works offline.
    rolldownOptions: { output: { codeSplitting: false } },
    chunkSizeWarningLimit: 900,
  },
});
