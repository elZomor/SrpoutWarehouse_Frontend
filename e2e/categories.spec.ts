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

interface MockCategory {
  id: number;
  name: string;
  description: string;
  archived: boolean;
  productTypeCount: number;
}

function routeCategories(page: import('@playwright/test').Page, categories: MockCategory[]) {
  let nextId = 1;

  return page.route('**/api/categories/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pathMatch = url.pathname.match(/\/api\/categories\/(\d+)\/(archive\/)?$/);

    if (method === 'GET' && !pathMatch) {
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const results = categories
        .filter((category) => !category.archived)
        .filter((category) => category.name.toLowerCase().includes(search));
      await route.fulfill({ status: 200, json: results });
      return;
    }

    if (method === 'POST' && !pathMatch) {
      const body = route.request().postDataJSON();
      const created: MockCategory = {
        id: nextId++,
        name: body.name,
        description: body.description ?? '',
        archived: false,
        productTypeCount: 0,
      };
      categories.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }

    if (pathMatch) {
      const id = Number(pathMatch[1]);
      const isArchiveAction = Boolean(pathMatch[2]);
      const category = categories.find((item) => item.id === id);

      if (method === 'POST' && isArchiveAction && category) {
        category.archived = true;
        await route.fulfill({ status: 200, json: category });
        return;
      }

      if (method === 'DELETE' && category) {
        if (category.productTypeCount > 0) {
          await route.fulfill({
            status: 400,
            json: {
              detail: `Cannot delete — ${category.productTypeCount} product types are assigned to this category. Archive it instead.`,
              assigned_product_type_count: category.productTypeCount,
            },
          });
          return;
        }
        categories.splice(categories.indexOf(category), 1);
        await route.fulfill({ status: 204, body: '' });
        return;
      }
    }

    await route.continue();
  });
}

test('creates a category and finds it via search', async ({ page }) => {
  const categories: MockCategory[] = [];

  await page.route('**/api/auth/**', stubAuth);
  await routeCategories(page, categories);

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

test('deletes a category with no product types', async ({ page }) => {
  // AC-5/TC-05
  const categories: MockCategory[] = [
    { id: 1, name: 'Lighting', description: '', archived: false, productTypeCount: 0 },
  ];

  await page.route('**/api/auth/**', stubAuth);
  await routeCategories(page, categories);

  await page.goto('/categories');
  await expect(page.getByText('Lighting')).toBeVisible();

  await page.getByRole('button', { name: /^delete$|^حذف$/i }).click();
  await page.getByRole('button', { name: /^ok$/i }).click();

  await expect(page.getByText('Lighting')).not.toBeVisible();
});

test('blocks deleting a category with assigned product types and archives it instead', async ({
  page,
}) => {
  // AC-3/AC-4/TC-03/TC-04
  const categories: MockCategory[] = [
    { id: 1, name: 'Lighting', description: '', archived: false, productTypeCount: 3 },
  ];

  await page.route('**/api/auth/**', stubAuth);
  await routeCategories(page, categories);

  await page.goto('/categories');
  await expect(page.getByText('Lighting')).toBeVisible();

  await page.getByRole('button', { name: /^delete$|^حذف$/i }).click();
  await page.getByRole('button', { name: /^ok$/i }).click();

  await expect(page.getByText(/cannot delete.*3 product types|لا يمكن الحذف.*3/i)).toBeVisible();
  await expect(page.getByText('Lighting')).toBeVisible();

  // The delete Popconfirm's OK button fades out asynchronously after being
  // clicked; wait for it to fully unmount so the archive Popconfirm's OK
  // button (opened next) is the only one matching this role/name.
  await expect(page.getByRole('button', { name: /^ok$/i })).toHaveCount(0);

  await page.getByRole('button', { name: /^archive$|^أرشفة$/i }).click();
  await page.getByRole('button', { name: /^ok$/i }).click();

  await expect(page.getByText('Lighting')).not.toBeVisible();
});
