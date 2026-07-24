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
    // WRH-34: unbounded file-level parallelism (Vitest's default) spawns one
    // process per test file - with 15+ files, several of them AntD/jsdom-
    // render-heavy (WorkOrdersPage.*, SerializedItemsPage, PurchaseOrdersPage),
    // that's more concurrent CPU-bound processes than this machine's cores.
    // Under that contention a worker can go long stretches without a
    // scheduler tick, which doesn't just add latency linearly - it inflates
    // individual async waits (userEvent's inter-keystroke delay, React's
    // scheduler, rc-motion timers) by 5-10x, occasionally past even a
    // generous per-test timeout (observed: a ~15s test hit 170-180s under
    // full-suite contention, still well under its 60000ms budget in a
    // smaller/isolated run). Capping concurrent processes keeps each one's
    // event loop responsive - fewer workers finishing predictably beats more
    // workers thrashing. Half the machine's cores leaves headroom for the
    // OS/other processes; raise if CI provisions more cores than this was
    // tuned on.
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
