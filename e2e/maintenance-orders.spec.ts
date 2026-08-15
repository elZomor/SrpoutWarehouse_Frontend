import { test, expect, type Route } from '@playwright/test';

// Mocks the backend entirely via page.route, matching boxes.spec.ts's
// precedent (auth + serialized-items + maintenance-orders endpoints).
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

interface MaintenanceOrder {
  id: number;
  reference: string;
  status: string;
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

test('creates a maintenance order from selected damaged items', async ({ page }) => {
  // TC-01/AC-1: MO-0001 created, status "open", selected items become
  // line items.
  const serializedItems: SerializedItem[] = [
    { id: 1, serial_number: 'SN-042', product_type: 1, status: 'damaged' },
  ];
  const maintenanceOrders: MaintenanceOrder[] = [];
  let nextId = 1;

  await page.route('**/api/auth/**', stubAuth);
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
  await page.route('**/api/maintenance-orders/**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({ status: 200, json: maintenanceOrders });
      return;
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const id = nextId++;
      const created: MaintenanceOrder = {
        id,
        reference: `MO-${String(id).padStart(4, '0')}`,
        status: 'open',
        items: serializedItems
          .filter((item) => body.item_ids.includes(item.id))
          .map((item) => ({ id: item.id, serial_number: item.serial_number, status: item.status })),
      };
      maintenanceOrders.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.continue();
  });

  await page.goto('/maintenance-orders');

  await page.getByRole('button', { name: /create maintenance order|إنشاء أمر صيانة/i }).click();
  const dialog = page.getByRole('dialog');
  const combobox = dialog.getByRole('combobox');
  await combobox.click();
  await page.getByTitle('SN-042').click();
  // The multi-select's dropdown stays open after picking an option (AntD's
  // mode="multiple" behavior) and would otherwise intercept the OK button's
  // click - matches boxes.spec.ts's identical Escape-before-submit step.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('MO-0001')).toBeVisible();
});

test('shows a translated, interpolated message when an item is rejected', async ({ page }) => {
  // WRH-46: item_ids rejections name a specific item (and, for the
  // already-on-another-MO case, the other MO's reference) - classified and
  // interpolated into a translated template, not shown as the raw server
  // string.
  const serializedItems: SerializedItem[] = [
    { id: 1, serial_number: 'SN-042', product_type: 1, status: 'damaged' },
  ];

  await page.route('**/api/auth/**', stubAuth);
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
  await page.route('**/api/maintenance-orders/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 400,
        json: { item_ids: ['SN-042 is already on maintenance order MO-0001'] },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/maintenance-orders');

  await page.getByRole('button', { name: /create maintenance order|إنشاء أمر صيانة/i }).click();
  const dialog = page.getByRole('dialog');
  const combobox = dialog.getByRole('combobox');
  await combobox.click();
  await page.getByTitle('SN-042').click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(
    page.getByText(
      /SN-042 is already on maintenance order MO-0001|SN-042 موجود بالفعل في أمر الصيانة MO-0001/i,
    ),
  ).toBeVisible();
});

test('resolves a line item as fixed and reflects the MO progressing to in_progress', async ({
  page,
}) => {
  // AC-1/AC-3/TC-01: marking one of an MO's two items "fixed" flips that
  // item to "available" and moves the MO from "open" to "in_progress"
  // (not every item resolved yet).
  const maintenanceOrder: MaintenanceOrder = {
    id: 1,
    reference: 'MO-0001',
    status: 'open',
    items: [
      { id: 1, serial_number: 'SN-042', status: 'in_maintenance' },
      { id: 2, serial_number: 'SN-099', status: 'in_maintenance' },
    ],
  };

  await page.route('**/api/auth/**', stubAuth);
  await page.route('**/api/serialized-items/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/maintenance-orders/**', async (route) => {
    const method = route.request().method();
    const url = route.request().url();

    if (method === 'GET' && url.endsWith('/api/maintenance-orders/')) {
      await route.fulfill({ status: 200, json: [maintenanceOrder] });
      return;
    }
    if (method === 'POST' && url.endsWith('/resolve/')) {
      const body = route.request().postDataJSON();
      maintenanceOrder.items = maintenanceOrder.items.map((item) =>
        item.id === body.item_id
          ? { ...item, status: body.resolution === 'fixed' ? 'available' : 'written_off' }
          : item,
      );
      maintenanceOrder.status = maintenanceOrder.items.every(
        (item) => item.status === 'available' || item.status === 'written_off',
      )
        ? 'completed'
        : 'in_progress';
      await route.fulfill({ status: 200, json: maintenanceOrder });
      return;
    }
    await route.continue();
  });

  await page.goto('/maintenance-orders');

  await expect(page.getByText('MO-0001')).toBeVisible();
  await page.getByRole('button', { name: /expand row/i }).click();
  await expect(page.getByText('SN-042')).toBeVisible();

  await page
    .getByRole('button', { name: /^mark fixed$|^تحديد كمُصلح$/i })
    .first()
    .click();
  await page.getByRole('button', { name: /^ok$|^موافق$/i }).click();

  await expect(page.getByText(/^available$|^متاح$/i)).toBeVisible();
  await expect(page.getByText(/^in progress$|^قيد التنفيذ$/i)).toBeVisible();
});
