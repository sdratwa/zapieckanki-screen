import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        controller: resolve(__dirname, 'controller.html'),
        screen: resolve(__dirname, 'screen.html'),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
