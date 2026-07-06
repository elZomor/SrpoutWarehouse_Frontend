import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // .env is gitignored (dev-only) and CI never sets VITE_API_BASE_URL, so
    // env.ts's validation would otherwise throw before the app can mount.
    // Same-origin also means page.route() mocks don't need CORS headers.
    env: { VITE_API_BASE_URL: 'http://localhost:4173' },
  },
});
