import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Wedding page: only the Aladdin score, published at /handbell_wed/ (separate from the main app).
export default defineConfig({
  root: 'wed',
  base: '/handbell_wed/',
  plugins: [react()],
  build: { outDir: '../dist-wed', emptyOutDir: true },
});
