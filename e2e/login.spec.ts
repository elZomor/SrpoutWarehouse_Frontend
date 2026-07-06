import { test, expect, type Route } from '@playwright/test';

const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};
const USER_DISPLAY_NAME = 'Jane Doe';

async function stubAuth(route: Route, loggedIn: () => boolean) {
  const url = route.request().url();
  const method = route.request().method();

  if (url.endsWith('/api/auth/me/') && method === 'GET') {
    if (loggedIn()) {
      await route.fulfill({ status: 200, json: USER });
    } else {
      await route.fulfill({ status: 401, json: {} });
    }
    return;
  }

  await route.continue();
}

test('unauthenticated visitor is redirected from a protected route to login', async ({ page }) => {
  await page.route('**/api/auth/**', (route) => stubAuth(route, () => false));

  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
});

test('user logs in, sees their name on the dashboard, then logs out', async ({ page }) => {
  let loggedIn = false;

  await page.route('**/api/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.endsWith('/api/auth/login/') && method === 'POST') {
      loggedIn = true;
      await route.fulfill({ status: 200, json: USER });
      return;
    }

    if (url.endsWith('/api/auth/logout/') && method === 'POST') {
      loggedIn = false;
      await route.fulfill({ status: 200, json: {} });
      return;
    }

    await stubAuth(route, () => loggedIn);
  });

  await page.goto('/login');

  await page.getByLabel(/email|البريد الإلكتروني/i).fill(USER.email);
  await page.getByLabel(/password|كلمة المرور/i).fill('correct-password');
  await page.getByRole('button', { name: /login|تسجيل الدخول/i }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(USER_DISPLAY_NAME)).toBeVisible();

  await page.getByRole('button', { name: /logout|تسجيل الخروج/i }).click();

  await expect(page).toHaveURL(/\/login$/);
});
