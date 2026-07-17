/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules', 'dist', 'e2e'],
    // Default 5000ms is tight for AntD Popconfirm/Modal rc-motion-heavy
    // tests under CI's slower runners - CategoriesPage's Popconfirm tests
    // intermittently timed out one at a time in CI (never locally) until
    // this was raised. Raised again 10000 -> 20000 for WRH-55:
    // WorkOrdersPage.test.tsx grew large enough (Tabs + 3 Table instances)
    // that under `--coverage` instrumentation individual tests in that file
    // (not just one specific one - varies run to run) intermittently cross
    // 10s even with `--no-file-parallelism` (see test:coverage in
    // package.json). Not a hang - the same tests pass in well under 1s
    // without coverage.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts', 'src/main.tsx', 'e2e/'],
      // Mirrors the backend's coverage fail_under=50 (line coverage only —
      // branches/functions aren't gated there either). Raise this over time
      // as real feature coverage grows past the current baseline (~57%).
      thresholds: {
        lines: 50,
        statements: 50,
      },
    },
  },
});
