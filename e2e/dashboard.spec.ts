import { test, expect, type Route } from '@playwright/test';

// Mocks the backend entirely via page.route, following work-orders.spec.ts's
// precedent.
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

test('shows per-product-type stock counts and drills into a product type', async ({ page }) => {
  // AC-1/AC-2/AC-3/TC-01/TC-02/TC-03
  const stockSummary = [
    {
      id: 1,
      name: 'Bar LED Model A',
      total_registered: 100,
      out: 30,
      damaged: 5,
      missing: 2,
      available: 62,
    },
  ];
  const serializedItems = [
    {
      id: 1,
      serial: 'a',
      serial_number: 'SN-0001',
      product_type: 1,
      product_type_name: 'Bar LED Model A',
      status: 'available',
      last_work_order_reference: '',
      notes: '',
    },
  ];

  await page.route('**/api/auth/**', stubAuth);
  await page.route('**/api/product-types/stock-summary/', (route) =>
    route.fulfill({ status: 200, json: stockSummary }),
  );
  await page.route('**/api/serialized-items/**', (route) =>
    route.fulfill({ status: 200, json: serializedItems }),
  );

  await page.goto('/');

  const row = page.getByRole('row', { name: /bar led model a/i });
  await expect(row).toContainText('100');
  await expect(row).toContainText('30');
  await expect(row).toContainText('5');
  await expect(row).toContainText('2');
  await expect(row).toContainText('62');

  await row.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('SN-0001')).toBeVisible();
  await expect(dialog.getByText(/^available$|^متاح$/i)).toBeVisible();
});

test('refreshes counts on demand and shows an empty state with no product types', async ({
  page,
}) => {
  // AC-4/AC-6/TC-04/TC-06
  let stockSummary: unknown[] = [];
  let requestCount = 0;

  await page.route('**/api/auth/**', stubAuth);
  await page.route('**/api/product-types/stock-summary/', (route) => {
    requestCount += 1;
    return route.fulfill({ status: 200, json: stockSummary });
  });

  await page.goto('/');

  await expect(page.getByText(/no product types found|لا توجد أنواع منتجات/i)).toBeVisible();

  stockSummary = [
    {
      id: 1,
      name: 'Bar LED Model A',
      total_registered: 0,
      out: 0,
      damaged: 0,
      missing: 0,
      available: 0,
    },
  ];
  const requestsBeforeRefresh = requestCount;

  await page.getByRole('button', { name: /refresh|تحديث/i }).click();

  await expect(page.getByRole('row', { name: /bar led model a/i })).toBeVisible();
  expect(requestCount).toBeGreaterThan(requestsBeforeRefresh);
  // AC-5/TC-05: a product type with zero items shows all zeros, not blank.
  const row = page.getByRole('row', { name: /bar led model a/i });
  const cells = await row.locator('td').allTextContents();
  expect(cells).toEqual(['Bar LED Model A', '0', '0', '0', '0', '0']);
});
