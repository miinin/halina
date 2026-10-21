import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['firebase/**/*.test.ts'], testTimeout: 20_000, fileParallelism: false },
});
