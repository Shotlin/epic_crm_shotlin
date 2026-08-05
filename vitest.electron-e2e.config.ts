// The resolver used by the legacy ESLint setup does not understand Vitest's
// package export map, while Vite resolves this import correctly at runtime.
// eslint-disable-next-line import/no-unresolved
import { defineConfig } from 'vitest/config';

/**
 * Desktop journeys launch a real Forge package and must never share jsdom's
 * mocked browser surface or a worker with another desktop process.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/electron/**/*.e2e.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    restoreMocks: true,
    clearMocks: true,
  },
});
