import { test, expect, type Route } from '@playwright/test';

// This spec mocks the backend entirely via page.route (auth + product-types
// + work-orders endpoints) rather than assuming a live backend at
// VITE_API_BASE_URL, following purchase-orders.spec.ts's precedent.
const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

interface WorkOrderLineItem {
  id: number;
  product_type: number;
  product_type_name: string;
  quantity: number;
  scanned_quantity: number;
  remaining_quantity: number;
}

interface WorkOrder {
  id: number;
  job_name: string;
  client_name: string;
  expected_date_out: string;
  status: string;
  created_by: number;
  created_by_username: string;
  line_items: WorkOrderLineItem[];
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

test('creates a work order with multiple line items and it appears in the list', async ({
  page,
}) => {
  // TC-01/AC-1, TC-02
  const workOrders: WorkOrder[] = [];
  let nextId = 1;
  const productTypeNames: Record<number, string> = { 1: 'Bar LED Model A', 2: 'Fog Machine' };

  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/work-orders/**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({ status: 200, json: workOrders });
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const created: WorkOrder = {
        id: nextId++,
        job_name: body.job_name,
        client_name: body.client_name,
        expected_date_out: body.expected_date_out,
        status: 'draft',
        created_by: USER.id,
        created_by_username: USER.username,
        line_items: body.line_items.map(
          (item: { product_type: number; quantity: number }, index: number) => ({
            id: index + 1,
            product_type: item.product_type,
            product_type_name: productTypeNames[item.product_type] ?? '',
            quantity: item.quantity,
            scanned_quantity: 0,
            remaining_quantity: item.quantity,
          }),
        ),
      };
      workOrders.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }

    await route.continue();
  });

  await page.goto('/work-orders');

  await page.getByRole('button', { name: /new wo|أمر عمل جديد/i }).click();
  await page.getByLabel(/job name|اسم المهمة/i).fill('Summer Gala');
  await page.getByLabel(/^client$|^العميل$/i).fill('Acme Events');
  await page.getByLabel(/expected date out|تاريخ الخروج المتوقع/i).fill('2026-08-01');
  await page.getByLabel(/expected date out|تاريخ الخروج المتوقع/i).press('Enter');

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

  await expect(page.getByText('Summer Gala')).toBeVisible();
  await expect(page.getByText('Acme Events')).toBeVisible();
  await expect(page.getByText(/^draft$|^مسودة$/i)).toBeVisible();
  await expect(page.getByText(/Bar LED Model A × 5/)).toBeVisible();
  await expect(page.getByText(/Fog Machine × 2/)).toBeVisible();
});

test('requires a product type and quantity before submitting', async ({ page }) => {
  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/work-orders/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    await route.continue();
  });

  await page.goto('/work-orders');

  await page.getByRole('button', { name: /new wo|أمر عمل جديد/i }).click();
  await page.getByLabel(/job name|اسم المهمة/i).fill('Summer Gala');
  await page.getByLabel(/expected date out|تاريخ الخروج المتوقع/i).fill('2026-08-01');
  await page.getByLabel(/expected date out|تاريخ الخروج المتوقع/i).press('Enter');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText(/product type is required|نوع المنتج مطلوب/i)).toBeVisible();
  await expect(
    page.getByText(/quantity must be at least 1|يجب أن تكون الكمية 1 على الأقل/i),
  ).toBeVisible();
});

test('fulfills a WO end-to-end: start, scan to completion, complete', async ({ page }) => {
  // TC-01/TC-02/TC-04/AC-1/AC-2/AC-4
  const workOrder: WorkOrder = {
    id: 1,
    job_name: 'Summer Gala',
    client_name: 'Acme Events',
    expected_date_out: '2026-08-01',
    status: 'draft',
    created_by: 1,
    created_by_username: 'jane',
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        quantity: 2,
        scanned_quantity: 0,
        remaining_quantity: 2,
      },
    ],
  };
  const seenSerialNumbers = new Set<string>();

  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await page.route('**/api/work-orders/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'POST' && url.endsWith('/start/')) {
      workOrder.status = 'in_progress';
      await route.fulfill({ status: 200, json: workOrder });
      return;
    }

    if (method === 'POST' && url.endsWith('/scan/')) {
      const body = route.request().postDataJSON() as {
        line_item: number;
        serial_number: string;
      };
      if (seenSerialNumbers.has(body.serial_number)) {
        await route.fulfill({
          status: 400,
          json: { serial_number: ['This item is not available to scan.'] },
        });
        return;
      }
      seenSerialNumbers.add(body.serial_number);
      const lineItem = workOrder.line_items.find((item) => item.id === body.line_item);
      if (lineItem) {
        lineItem.scanned_quantity += 1;
        lineItem.remaining_quantity -= 1;
      }
      await route.fulfill({ status: 201, json: workOrder });
      return;
    }

    if (method === 'POST' && url.endsWith('/complete/')) {
      workOrder.status = 'fulfilled';
      await route.fulfill({ status: 200, json: workOrder });
      return;
    }

    if (method === 'GET') {
      await route.fulfill({ status: 200, json: [workOrder] });
      return;
    }

    await route.continue();
  });

  await page.goto('/work-orders');

  // Scoped to the row's own action button rather than matching accessible
  // name text: AntD's Button loading-spinner fade-out animation (real
  // browser only, unlike jsdom) can briefly prefix the next button's
  // accessible name with "loading" right after the mutation settles, and
  // the button's own label also changes ("Start Fulfillment" -> "Scan")
  // once the row re-renders for the new status.
  const row = page.getByRole('row', { name: /summer gala/i });
  await row.getByRole('button').click();
  await expect(page.getByText(/^in progress$|^قيد التنفيذ$/i)).toBeVisible();

  const completeButton = page.getByRole('button', {
    name: /complete fulfillment|إتمام التنفيذ/i,
  });
  await row.getByRole('button').click();
  await expect(completeButton).toBeDisabled();

  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByTitle('Bar LED Model A').click();
  const dialog = page.getByRole('dialog');
  const scanButton = dialog.locator('button[type="submit"]');
  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-1001');
  await scanButton.click();
  await expect(dialog.getByRole('row', { name: /bar led model a/i })).toContainText('1');

  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-1002');
  await scanButton.click();
  await expect(completeButton).toBeEnabled();

  await completeButton.click();
  await expect(page.getByText(/^fulfilled$|^تم التنفيذ$/i)).toBeVisible();
});
