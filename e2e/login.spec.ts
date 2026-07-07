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

test('client-side validation blocks submission and never calls the API', async ({ page }) => {
  // WRH-19 TC-01 - TC-04
  let loginRequestCount = 0;
  await page.route('**/api/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.endsWith('/api/auth/login/') && method === 'POST') {
      loginRequestCount += 1;
    }

    await stubAuth(route, () => false);
  });

  await page.goto('/login');

  // Both fields empty
  await page.getByRole('button', { name: /login|تسجيل الدخول/i }).click();
  await expect(page.getByText(/email is required|البريد الإلكتروني مطلوب/i)).toBeVisible();
  await expect(page.getByText(/password is required|كلمة المرور مطلوبة/i)).toBeVisible();

  // Malformed email
  await page.getByLabel(/email|البريد الإلكتروني/i).fill('not-an-email');
  await page.getByLabel(/password|كلمة المرور/i).fill('some-password');
  await page.getByRole('button', { name: /login|تسجيل الدخول/i }).click();
  await expect(
    page.getByText(/enter a valid email address|أدخل بريدًا إلكترونيًا صالحًا/i),
  ).toBeVisible();

  await expect(page).toHaveURL(/\/login$/);
  expect(loginRequestCount).toBe(0);
});

test('failed login shows a generic error and never establishes a session', async ({ page }) => {
  // WRH-19 TC-05/TC-06/TC-08
  await page.route('**/api/auth/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.endsWith('/api/auth/login/') && method === 'POST') {
      await route.fulfill({
        status: 401,
        json: { detail: 'Invalid email or password.' },
      });
      return;
    }

    await stubAuth(route, () => false);
  });

  await page.goto('/login');

  await page.getByLabel(/email|البريد الإلكتروني/i).fill('jane@example.com');
  await page.getByLabel(/password|كلمة المرور/i).fill('wrong-password');
  await page.getByRole('button', { name: /login|تسجيل الدخول/i }).click();

  await expect(
    page.getByText(/invalid email or password|البريد الإلكتروني أو كلمة المرور غير صحيحة/i),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  // No client-side authenticated state was established by the failed
  // attempt: a protected route still bounces back to /login. (The actual
  // absence of a real sessionid cookie is covered against the live backend
  // by the sibling WRH-19 Django PR's test_no_session_cookie_on_failed_login
  // - every request here is mocked, so no real Set-Cookie is ever in play.)
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
