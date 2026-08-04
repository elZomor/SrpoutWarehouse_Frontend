import { test, expect, type Route } from '@playwright/test';

// Mocks the backend entirely via page.route, matching serialized-items.spec.ts's
// precedent (auth + product-types + serialized-items + boxes endpoints).
const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

interface SerializedItem {
  id: number;
  serial_number: string;
  product_type: number;
  status: string;
}

interface Box {
  id: number;
  code: string;
  uuid: string;
  product_type: number;
  product_type_name: string;
  items: { id: number; serial_number: string; status: string }[];
}

async function stubAuth(route: Route) {
  const url = route.request().url();
  const method = route.request().method();

  if (url.endsWith('/api/auth/me/') && method === 'GET') {
    await route.fulfill({ status: 200, json: USER });
    return;
  }

  await route.continue();
}

function registerProductTypesRoute(page: import('@playwright/test').Page) {
  const productTypes = [
    { id: 1, name: 'Bar LED Model A', model_code: '', description: '', category: 1 },
  ];
  return page.route('**/api/product-types/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: productTypes });
      return;
    }
    await route.continue();
  });
}

test('registers a box with available items and prints its QR', async ({ page }) => {
  // TC-01/AC-1, TC-02
  const serializedItems: SerializedItem[] = [
    { id: 1, serial_number: 'SN-042', product_type: 1, status: 'available' },
  ];
  const boxes: Box[] = [];
  let nextId = 1;

  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/serialized-items/**', async (route) => {
    const url = new URL(route.request().url());
    const productTypeFilter = url.searchParams.get('product_type');
    if (route.request().method() === 'GET') {
      const results = serializedItems.filter(
        (item) => !productTypeFilter || String(item.product_type) === productTypeFilter,
      );
      await route.fulfill({
        status: 200,
        json: results.map((item) => ({
          ...item,
          serial: `00000000-0000-0000-0000-00000000000${item.id}`,
          product_type_name: 'Bar LED Model A',
          last_work_order_reference: '',
          notes: '',
        })),
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/boxes/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const qrMatch = url.pathname.match(/\/api\/boxes\/(\d+)\/qr-code\/$/);

    if (method === 'GET' && !qrMatch) {
      await route.fulfill({ status: 200, json: boxes });
      return;
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const id = nextId++;
      const created: Box = {
        id,
        code: body.code,
        uuid: `00000000-0000-0000-0000-00000000000${id}`,
        product_type: body.product_type,
        product_type_name: 'Bar LED Model A',
        items: serializedItems
          .filter((item) => body.item_ids.includes(item.id))
          .map((item) => ({ id: item.id, serial_number: item.serial_number, status: item.status })),
      };
      boxes.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (method === 'GET' && qrMatch) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        // Smallest valid 1x1 transparent PNG.
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/boxes');

  await page.getByRole('button', { name: /register box|تسجيل صندوق/i }).click();
  await page.getByLabel(/box code|رمز الصندوق/i).fill('BX-001');
  const dialog = page.getByRole('dialog');
  const comboboxes = dialog.getByRole('combobox');
  await comboboxes.nth(0).click();
  await page.getByTitle('Bar LED Model A').click();
  await comboboxes.nth(1).click();
  await page.getByTitle('SN-042').click();
  // The multi-select's dropdown stays open after picking an option (AntD's
  // mode="multiple" behavior, unlike the single-select product type field
  // above) and would otherwise intercept the OK button's click.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('BX-001')).toBeVisible();

  const printButton = page.getByRole('button', { name: /print qr|طباعة رمز qr/i });
  const [popup] = await Promise.all([page.waitForEvent('popup'), printButton.click()]);
  await expect(popup.locator('img')).toHaveAttribute(
    'src',
    'http://localhost:4173/api/boxes/1/qr-code/',
  );
  await expect(popup.getByText('BX-001')).toBeVisible();
  await popup.close();
});

test('shows the server-provided message when an item is rejected', async ({ page }) => {
  // WRH-27/AC-2: item_ids rejections name a specific item and the
  // specific other box it's already in - shown verbatim, not a generic
  // banner.
  const serializedItems: SerializedItem[] = [
    { id: 1, serial_number: 'SN-042', product_type: 1, status: 'available' },
  ];

  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/serialized-items/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        json: serializedItems.map((item) => ({
          ...item,
          serial: `00000000-0000-0000-0000-00000000000${item.id}`,
          product_type_name: 'Bar LED Model A',
          last_work_order_reference: '',
          notes: '',
        })),
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/boxes/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 400,
        json: { item_ids: ['SN-042 is already in box BX-001'] },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/boxes');

  await page.getByRole('button', { name: /register box|تسجيل صندوق/i }).click();
  await page.getByLabel(/box code|رمز الصندوق/i).fill('BX-002');
  const dialog = page.getByRole('dialog');
  const comboboxes = dialog.getByRole('combobox');
  await comboboxes.nth(0).click();
  await page.getByTitle('Bar LED Model A').click();
  await comboboxes.nth(1).click();
  await page.getByTitle('SN-042').click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('SN-042 is already in box BX-001')).toBeVisible();
});
