import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the API runs on :8787 (cd ../server && npm run dev).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787', '/uploads': 'http://localhost:8787' },
  },
  build: { chunkSizeWarningLimit: 800 },
});
