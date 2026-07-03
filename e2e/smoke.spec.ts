import { test, expect } from '@playwright/test';

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
