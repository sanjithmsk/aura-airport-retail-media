import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* The web client talks to @aura/api over /api. In dev Vite proxies it so the
   browser sees one origin and the SSE stream on /api/events stays open. */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true
      }
    }
  },
  preview: { port: 4173 },
  build: { outDir: 'dist', sourcemap: true }
});
