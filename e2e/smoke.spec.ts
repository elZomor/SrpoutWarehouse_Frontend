import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // The dashboard at "/" is a protected route (WRH-18) — stub an authenticated
  // session so these shell/i18n smoke tests can still reach it.
  await page.route('**/api/auth/me/', (route) =>
    route.fulfill({
      status: 200,
      json: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' } },
    }),
  );
  // The dashboard also renders the WRH-48 stock summary, which fires its own
  // GET on mount - stub it so these shell/i18n tests aren't affected by an
  // unrelated, unmocked request.
  await page.route('**/api/product-types/stock-summary/', (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
});

test('dashboard shell loads with default RTL locale', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('مرحبًا بك في سبروت للمخازن')).toBeVisible();
});

test('language switcher toggles to English and flips to LTR', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'English' }).click();

  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByText('Welcome to Sprout Warehouse')).toBeVisible();
});
