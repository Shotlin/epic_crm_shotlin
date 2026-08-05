// Keep this nested package dependency-free. Vitest accepts a plain config
// object, so the isolated read-only Hub does not need to import the parent
// package's test helper just to run its contract tests.
export default {
  root: __dirname,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
};
