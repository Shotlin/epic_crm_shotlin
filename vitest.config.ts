// Vitest exposes its typed Vite extension through this documented subpath.
// eslint-disable-next-line import/no-unresolved
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Renderer suites run alongside database and Electron-bound tests in CI;
    // allow a busy worker more than the Vitest 5s default while still failing
    // genuinely hung journeys promptly.
    testTimeout: 15_000,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    restoreMocks: true,
    clearMocks: true,
  },
});
