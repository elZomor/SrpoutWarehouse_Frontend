import { test, expect, type Route } from '@playwright/test';

// This spec mocks the backend entirely via page.route (auth + categories
// endpoints) rather than assuming a live backend at VITE_API_BASE_URL,
// following login.spec.ts's precedent.
const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

async function stubAuth(route: Route) {
  const url = route.request().url();
  const method = route.request().method();

  if (url.endsWith('/api/auth/me/') && method === 'GET') {
    await route.fulfill({ status: 200, json: USER });
    return;
  }

  await route.continue();
}

test('creates a category and finds it via search', async ({ page }) => {
  const categories: Array<{ id: number; name: string; description: string }> = [];
  let nextId = 1;

  await page.route('**/api/auth/**', stubAuth);
  await page.route('**/api/categories/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (method === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const results = categories.filter((category) => category.name.toLowerCase().includes(search));
      await route.fulfill({ status: 200, json: results });
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const created = {
        id: nextId++,
        name: body.name,
        description: body.description ?? '',
      };
      categories.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }

    await route.continue();
  });

  await page.goto('/categories');

  await page.getByRole('button', { name: /new category|فئة جديدة/i }).click();
  await page.getByLabel(/^name$|^الاسم$/i).fill('Lighting');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('Lighting')).toBeVisible();

  await page.getByPlaceholder(/search by name|البحث بالاسم/i).fill('Light');

  await expect(page.getByText('Lighting')).toBeVisible();

  await page.getByPlaceholder(/search by name|البحث بالاسم/i).fill('nonexistent');

  await expect(page.getByText(/no categories found|لا توجد فئات/i)).toBeVisible();
});
