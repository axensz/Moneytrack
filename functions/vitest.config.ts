import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    // Emulator-backed integration tests make real Admin SDK round-trips; the
    // first cold connection can exceed the 5s default. Unit tests finish in ms,
    // so a generous ceiling only matters for a genuinely stuck test.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
