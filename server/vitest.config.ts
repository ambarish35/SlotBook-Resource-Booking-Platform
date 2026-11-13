import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Each file starts its own in-memory MongoDB, so run files one at a time.
    fileParallelism: false,
    // The first run downloads a MongoDB binary, which can take a few minutes.
    hookTimeout: 300_000,
    testTimeout: 30_000,
  },
});
