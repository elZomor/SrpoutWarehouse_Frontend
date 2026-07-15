import { test, expect, type Route } from '@playwright/test';

// This spec mocks the backend entirely via page.route (auth + product-types
// + purchase-orders endpoints) rather than assuming a live backend at
// VITE_API_BASE_URL, following login.spec.ts's precedent.
const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

interface PurchaseOrderLineItem {
  id: number;
  product_type: number;
  product_type_name: string;
  expected_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
}

interface PurchaseOrder {
  id: number;
  supplier_name: string;
  order_date: string;
  status: string;
  line_items: PurchaseOrderLineItem[];
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

test('creates a purchase order with multiple line items and it appears in the list', async ({
  page,
}) => {
  // TC-01/AC-1, TC-02
  const purchaseOrders: PurchaseOrder[] = [];
  let nextId = 1;
  const productTypeNames: Record<number, string> = { 1: 'Bar LED Model A', 2: 'Fog Machine' };

  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/purchase-orders/**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({ status: 200, json: purchaseOrders });
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const created: PurchaseOrder = {
        id: nextId++,
        supplier_name: body.supplier_name,
        order_date: body.order_date,
        status: 'pending',
        line_items: body.line_items.map(
          (item: { product_type: number; expected_quantity: number }, index: number) => ({
            id: index + 1,
            product_type: item.product_type,
            product_type_name: productTypeNames[item.product_type] ?? '',
            expected_quantity: item.expected_quantity,
            received_quantity: 0,
            remaining_quantity: item.expected_quantity,
          }),
        ),
      };
      purchaseOrders.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }

    await route.continue();
  });

  await page.goto('/purchase-orders');

  await page.getByRole('button', { name: /new po|أمر شراء جديد/i }).click();
  await page.getByLabel(/^supplier$|^المورد$/i).fill('Acme Lighting Co');
  await page.getByLabel(/order date|تاريخ الطلب/i).fill('2026-07-01');
  await page.getByLabel(/order date|تاريخ الطلب/i).press('Enter');

  await page.getByRole('dialog').getByRole('combobox').first().click();
  await page.getByTitle('Bar LED Model A').click();
  await page
    .getByPlaceholder(/qty|الكمية/i)
    .first()
    .fill('5');

  await page.getByRole('button', { name: /add line item|إضافة بند/i }).click();
  // Select by keyboard rather than clicking a dropdown option by title:
  // two Select instances share the same option list (one per line item),
  // and the first one's closed dropdown can still be mid-close-animation
  // (flaky under CI's slower rendering) when the second opens, so a
  // title-text query can match either one's node non-deterministically.
  await page.getByRole('dialog').getByRole('combobox').nth(1).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page
    .getByPlaceholder(/qty|الكمية/i)
    .nth(1)
    .fill('2');

  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('Acme Lighting Co')).toBeVisible();
  await expect(page.getByText(/pending|قيد الانتظار/i)).toBeVisible();
  await expect(page.getByText(/Bar LED Model A × 5/)).toBeVisible();
  await expect(page.getByText(/Fog Machine × 2/)).toBeVisible();
});

test('requires a product type and quantity before submitting', async ({ page }) => {
  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/purchase-orders/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    await route.continue();
  });

  await page.goto('/purchase-orders');

  await page.getByRole('button', { name: /new po|أمر شراء جديد/i }).click();
  await page.getByLabel(/^supplier$|^المورد$/i).fill('Acme Lighting Co');
  await page.getByLabel(/order date|تاريخ الطلب/i).fill('2026-07-01');
  await page.getByLabel(/order date|تاريخ الطلب/i).press('Enter');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText(/product type is required|نوع المنتج مطلوب/i)).toBeVisible();
  await expect(
    page.getByText(/quantity must be at least 1|يجب أن تكون الكمية 1 على الأقل/i),
  ).toBeVisible();
});

test('receives a PO by scanning serials, showing partial then full receipt', async ({ page }) => {
  // TC-01/TC-03/AC-1/AC-3
  const purchaseOrder: PurchaseOrder = {
    id: 1,
    supplier_name: 'Acme Lighting Co',
    order_date: '2026-07-01',
    status: 'pending',
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        expected_quantity: 2,
        received_quantity: 0,
        remaining_quantity: 2,
      },
    ],
  };

  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/purchase-orders/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'POST' && url.includes('/receive/')) {
      const body = route.request().postDataJSON() as { line_item: number; serial_number: string };
      const lineItem = purchaseOrder.line_items.find((item) => item.id === body.line_item);
      if (lineItem) {
        lineItem.received_quantity += 1;
        lineItem.remaining_quantity -= 1;
      }
      purchaseOrder.status = purchaseOrder.line_items.every((item) => item.remaining_quantity <= 0)
        ? 'received'
        : 'partially_received';
      await route.fulfill({ status: 201, json: purchaseOrder });
      return;
    }

    if (method === 'GET') {
      await route.fulfill({ status: 200, json: [purchaseOrder] });
      return;
    }

    await route.continue();
  });

  await page.goto('/purchase-orders');

  // Scoped to the submit button's type attribute rather than its accessible
  // name: AntD prefixes the loading spinner's own "loading" label onto the
  // button's name while a scan is in flight (briefly turning "Scan"/"مسح"
  // into "loading Scan"/"loading مسح"), which can race an anchored
  // name-based locator's retry window on a second scan fired right after
  // the first one settles.
  const scanButton = page.getByRole('dialog').locator('button[type="submit"]');

  await page.getByRole('button', { name: /receive|استلام/i }).click();
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByTitle('Bar LED Model A').click();
  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-1001');
  await scanButton.click();

  await expect(page.getByRole('dialog').getByRole('row').last()).toContainText('1');

  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-1002');
  await scanButton.click();
  await page.getByRole('button', { name: /done|تم/i }).click();

  await expect(page.getByText(/^received$|^تم الاستلام$/i)).toBeVisible();
});
