import { test, expect, type Route } from '@playwright/test';

// This spec mocks the backend entirely via page.route (auth + product-types
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

test('creates a product type and finds it via search', async ({ page }) => {
  const productTypes: Array<{
    id: number;
    name: string;
    model_code: string;
    description: string;
  }> = [];
  let nextId = 1;

  await page.route('**/api/auth/**', stubAuth);
  await page.route('**/api/product-types/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (method === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const results = productTypes.filter(
        (productType) =>
          productType.name.toLowerCase().includes(search) ||
          productType.model_code.toLowerCase().includes(search),
      );
      await route.fulfill({ status: 200, json: results });
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const created = {
        id: nextId++,
        name: body.name,
        model_code: body.model_code ?? '',
        description: body.description ?? '',
      };
      productTypes.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }

    await route.continue();
  });

  await page.goto('/product-types');

  await page.getByRole('button', { name: /new product type|نوع منتج جديد/i }).click();
  await page.getByLabel(/^name$|^الاسم$/i).fill('Bar LED Model A');
  await page.getByLabel(/model code|رمز الموديل/i).fill('BAR-LED-A');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('Bar LED Model A')).toBeVisible();

  await page
    .getByPlaceholder(/search by name or model code|البحث بالاسم أو رمز الموديل/i)
    .fill('BAR-LED-A');

  await expect(page.getByText('Bar LED Model A')).toBeVisible();

  await page
    .getByPlaceholder(/search by name or model code|البحث بالاسم أو رمز الموديل/i)
    .fill('nonexistent');

  await expect(page.getByText(/no product types found|لا توجد أنواع منتجات/i)).toBeVisible();
});
