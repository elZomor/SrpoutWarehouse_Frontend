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
