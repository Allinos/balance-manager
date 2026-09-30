import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The portal is served by the DocGen server on its own port:
//   npm start    → builds portal/dist when needed, then serves it
//   npm run dev  → Vite runs inside the server (live reload), same port
export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
});
