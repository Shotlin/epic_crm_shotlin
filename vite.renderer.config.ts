import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Epic BOS keeps a strict renderer CSP. Vite's React refresh pipeline injects
  // an inline preamble in development, which the CSP correctly refuses to run
  // and leaves the desktop window as raw HTML. Turning HMR off makes the React
  // plugin omit that preamble; normal browser reloads still work and development
  // keeps the same script policy as the packaged renderer.
  plugins: [react()],
  server: {
    hmr: false,
  },
  build: {
    target: 'chrome136',
  },
});
