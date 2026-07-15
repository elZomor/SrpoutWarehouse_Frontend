import { test, expect, type Route } from '@playwright/test';

// This spec mocks the backend entirely via page.route (auth + product-types
// + serialized-items endpoints) rather than assuming a live backend at
// VITE_API_BASE_URL, following login.spec.ts's precedent.
const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

interface SerializedItem {
  id: number;
  serial: string;
  serial_number: string;
  product_type: number;
  product_type_name: string;
  status: string;
  last_work_order_reference: string;
  notes: string;
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
    { id: 2, name: 'Fog Machine', model_code: '', description: '', category: 1 },
  ];
  return page.route('**/api/product-types/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: productTypes });
      return;
    }

    await route.continue();
  });
}

test('registers a serialized item, prints its QR, then filters and searches for it', async ({
  page,
}) => {
  // TC-01/AC-1, TC-02, TC-03/AC-3, TC-04/AC-4
  const serializedItems: SerializedItem[] = [];
  let nextId = 1;

  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/serialized-items/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pathMatch = url.pathname.match(/\/api\/serialized-items\/(\d+)\/$/);

    if (method === 'GET' && !pathMatch) {
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const productTypeFilter = url.searchParams.get('product_type');
      const results = serializedItems.filter(
        (item) =>
          item.serial_number.toLowerCase().includes(search) &&
          (!productTypeFilter || String(item.product_type) === productTypeFilter),
      );
      await route.fulfill({ status: 200, json: results });
      return;
    }

    if (method === 'POST' && !pathMatch) {
      const body = route.request().postDataJSON();
      const id = nextId++;
      const productTypeNames: Record<number, string> = {
        1: 'Bar LED Model A',
        2: 'Fog Machine',
      };
      const created: SerializedItem = {
        id,
        serial: `00000000-0000-0000-0000-00000000000${id}`,
        serial_number: body.serial_number,
        product_type: body.product_type,
        product_type_name: productTypeNames[body.product_type] ?? '',
        status: 'available',
        last_work_order_reference: '',
        notes: '',
      };
      serializedItems.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }

    if (method === 'DELETE' && pathMatch) {
      const id = Number(pathMatch[1]);
      const index = serializedItems.findIndex((item) => item.id === id);
      if (index !== -1) {
        serializedItems.splice(index, 1);
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.continue();
  });

  await page.goto('/serialized-items');

  await page.getByRole('button', { name: /register item|تسجيل وحدة/i }).click();
  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-042');
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByTitle('Bar LED Model A').click();
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('SN-042')).toBeVisible();
  await expect(page.getByText(/available|متاح/i)).toBeVisible();

  const printButton = page.getByRole('button', { name: /print qr|طباعة رمز qr/i });
  await expect(printButton).toBeVisible();
  const [popup] = await Promise.all([page.waitForEvent('popup'), printButton.click()]);
  await expect(popup.locator('img')).toHaveAttribute(
    'src',
    'http://localhost:4173/api/serialized-items/1/qr-code/',
  );
  await expect(popup.getByText('SN-042')).toBeVisible();
  await expect(popup.getByText('Bar LED Model A')).toBeVisible();
  await popup.close();

  await page.getByRole('button', { name: /register item|تسجيل وحدة/i }).click();
  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('FOG-001');
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByTitle('Fog Machine').click();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('FOG-001')).toBeVisible();

  await page.getByPlaceholder(/search by serial number|البحث بالرقم التسلسلي/i).fill('SN-0');
  await expect(page.getByText('SN-042')).toBeVisible();
  await expect(page.getByText('FOG-001')).not.toBeVisible();

  await page.getByPlaceholder(/search by serial number|البحث بالرقم التسلسلي/i).fill('');
  await expect(page.getByText('FOG-001')).toBeVisible();

  // AntD Select renders its placeholder as inner text, not a real input
  // `placeholder` attribute - target it by role instead (unambiguous here
  // since the registration modal is closed, leaving this as the only
  // combobox on screen).
  await page.getByRole('combobox').click();
  // AntD keeps earlier dropdowns' option nodes in the DOM (hidden) after
  // close, so a plain getByTitle matches more than one by this point in
  // the test - scope to the currently open (visible) dropdown.
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByTitle('Fog Machine')
    .click();
  await expect(page.getByText('FOG-001')).toBeVisible();
  await expect(page.getByText('SN-042')).not.toBeVisible();
});

test('downloads a bulk QR labels PDF for the selected product type', async ({ page }) => {
  // AC-4/AC-5
  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/serialized-items/qr-pdf/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-fake-content'),
    });
  });
  await page.route('**/api/serialized-items/**', async (route) => {
    if (route.request().url().includes('qr-pdf')) {
      await route.continue();
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        json: [
          {
            id: 1,
            serial: '00000000-0000-0000-0000-000000000001',
            serial_number: 'SN-042',
            product_type: 1,
            product_type_name: 'Bar LED Model A',
            status: 'available',
            last_work_order_reference: '',
            notes: '',
          },
        ],
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/serialized-items');
  await expect(page.getByText('SN-042')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /download qr pdf|تنزيل ملصقات qr/i }).click(),
  ]);

  expect(download.suggestedFilename()).toBe('qr-labels.pdf');
});

test('shows an inline error when registering a duplicate serial number', async ({ page }) => {
  // AC-1/AC-2
  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/serialized-items/**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        json: [
          {
            id: 1,
            serial: '00000000-0000-0000-0000-000000000001',
            serial_number: 'SN-042',
            product_type: 1,
            product_type_name: 'Bar LED Model A',
            status: 'available',
            last_work_order_reference: '',
            notes: '',
          },
        ],
      });
      return;
    }

    if (method === 'POST') {
      await route.fulfill({
        status: 400,
        json: { serial_number: ['Serial number SN-042 is already registered.'] },
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/serialized-items');
  await expect(page.getByText('SN-042')).toBeVisible();

  await page.getByRole('button', { name: /register item|تسجيل وحدة/i }).click();
  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-042');
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByTitle('Bar LED Model A').click();
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(
    page.getByText(
      /an item with this serial number is already registered|توجد وحدة مسجلة بهذا الرقم التسلسلي بالفعل/i,
    ),
  ).toBeVisible();
});

test('deletes a serialized item, leaving a sibling item unaffected', async ({ page }) => {
  // TC-01/AC-1, TC-02/AC-2
  const serializedItems: SerializedItem[] = [
    {
      id: 1,
      serial: '00000000-0000-0000-0000-000000000001',
      serial_number: 'SN-042',
      product_type: 1,
      product_type_name: 'Bar LED Model A',
      status: 'available',
      last_work_order_reference: '',
      notes: '',
    },
    {
      id: 2,
      serial: '00000000-0000-0000-0000-000000000002',
      serial_number: 'SN-043',
      product_type: 1,
      product_type_name: 'Bar LED Model A',
      status: 'available',
      last_work_order_reference: '',
      notes: '',
    },
  ];

  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/serialized-items/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pathMatch = url.pathname.match(/\/api\/serialized-items\/(\d+)\/$/);

    if (method === 'GET' && !pathMatch) {
      await route.fulfill({ status: 200, json: serializedItems });
      return;
    }

    if (method === 'DELETE' && pathMatch) {
      const id = Number(pathMatch[1]);
      const index = serializedItems.findIndex((item) => item.id === id);
      if (index !== -1) {
        serializedItems.splice(index, 1);
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.continue();
  });

  await page.goto('/serialized-items');
  await expect(page.getByText('SN-042')).toBeVisible();
  await expect(page.getByText('SN-043')).toBeVisible();

  await page
    .getByRole('row', { name: /SN-042/ })
    .getByRole('button', { name: /^delete$|^حذف$/i })
    .click();
  await page.getByRole('button', { name: /^ok$|^موافق$/i }).click();

  await expect(page.getByText('SN-042')).not.toBeVisible();
  await expect(page.getByText('SN-043')).toBeVisible();
});
