import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The desktop app's sources: document types, templates/renderer, GST engine and services are shared, not copied. */
export const desktopSrc = path.resolve(here, '../../document-generator/src');
const desktopApi = path.join(desktopSrc, 'services', 'api.js');
const mobileApi = path.join(here, 'src', 'engine', 'api.js');

/** The desktop services talk to the Rust backend through services/api.js; on the phone the same calls go to the on-device engine. */
const onDeviceBackend = {
  name: 'docgen-on-device-backend',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source.endsWith('api.js') && path.resolve(path.dirname(importer), source) === desktopApi) return mobileApi;
    return null;
  },
};

/** DocGen Mobile is served by the backend under /app/ (its own scope for installation as an app). */
export default defineConfig({
  root: here,
  base: '/app/',
  plugins: [onDeviceBackend, react()],
  resolve: {
    alias: { '@desktop': desktopSrc },
    // Desktop files are outside this project: always use this project's single copy of these packages.
    dedupe: ['react', 'react-dom', 'qrcode-generator'],
  },
  build: {
    outDir: 'dist',
    // One bundle: the service worker caches the whole app on the first visit, so it works offline.
    rolldownOptions: { output: { codeSplitting: false } },
    chunkSizeWarningLimit: 1500,
  },
});
