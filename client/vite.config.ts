import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env['VITE_API_TARGET'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxying keeps the client same-origin with the API in development, which
    // is what lets the server run without any CORS middleware. In the container
    // nginx plays the same role.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
