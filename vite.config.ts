import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Tauri expects a fixed port, fail if unavailable
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
  },
  // Produce smaller chunks for Tauri's asset protocol
  build: {
    target: 'es2023',
    minify: 'esbuild',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
  },
});
