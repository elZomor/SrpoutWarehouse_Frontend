import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// Standalone security scan (the "review-bot" job) — deliberately separate
// from eslint.config.js, mirroring the backend's bandit job running apart
// from flake8. Keeps this scan runnable/reportable on its own.
export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended, security.configs.recommended],
  },
]);
