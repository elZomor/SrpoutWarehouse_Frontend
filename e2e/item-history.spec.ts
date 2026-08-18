import { test, expect, type Route } from '@playwright/test';

// WRH-79: covers AC-1/AC-2/AC-3/AC-4/AC-5 of the shared item history card
// via the stock (SerializedItemsPage) screen - mocks the backend entirely
// via page.route, following serialized-items.spec.ts's precedent. AC-6
// (same shared component on box detail / WO detail) is covered by
// BoxesPage.test.tsx and WorkOrdersPage.itemHistory.test.tsx at the unit
// level rather than duplicating a full e2e flow per screen.
const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

interface Transaction {
  id: number;
  transaction_type: string;
  transaction_type_display: string;
  reference_number: string;
  serial_number: string;
  product_type_name: string;
  created_at: string;
  user_username: string;
  note: string;
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
  return page.route('**/api/product-types/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        json: [{ id: 1, name: 'Bar LED Model A', model_code: '', description: '', category: 1 }],
      });
      return;
    }
    await route.continue();
  });
}

function registerSerializedItemsRoute(page: import('@playwright/test').Page) {
  return page.route('**/api/serialized-items/**', async (route) => {
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
            status: 'out',
            last_work_order_reference: 'WO-1',
            notes: '',
          },
        ],
      });
      return;
    }
    await route.continue();
  });
}

function registerTransactionsRoute(
  page: import('@playwright/test').Page,
  transactions: Transaction[],
) {
  return page.route('**/api/transactions/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, json: transactions });
  });
}

test('clicking a stock item opens its shared history card, newest-first, and closing preserves the list', async ({
  page,
}) => {
  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await registerSerializedItemsRoute(page);
  await registerTransactionsRoute(page, [
    {
      id: 1,
      transaction_type: 'receive',
      transaction_type_display: 'Receive',
      reference_number: 'PO-1',
      serial_number: 'SN-042',
      product_type_name: 'Bar LED Model A',
      created_at: '2026-08-01T10:00:00Z',
      user_username: 'jane',
      note: '',
    },
    {
      id: 2,
      transaction_type: 'issue',
      transaction_type_display: 'Issue',
      reference_number: 'WO-1',
      serial_number: 'SN-042',
      product_type_name: 'Bar LED Model A',
      created_at: '2026-08-05T10:00:00Z',
      user_username: 'jane',
      note: '',
    },
  ]);

  await page.goto('/serialized-items');

  await page.getByText('SN-042').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Bar LED Model A — SN-042')).toBeVisible();

  // AC-3: newest-to-oldest - the "Issue" (WO-1) row appears above "Receive"
  // (PO-1) in document order.
  const rows = dialog.locator('.ant-table-tbody > tr.ant-table-row');
  await expect(rows.first()).toContainText('WO-1');
  await expect(rows.nth(1)).toContainText('PO-1');

  // AC-5: closing returns to the originating list, no reload/state loss.
  await dialog.locator('.ant-modal-footer').getByRole('button').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('cell', { name: 'SN-042' })).toBeVisible();
});

test('clicking a stock item with no history shows the empty state (AC-4)', async ({ page }) => {
  await page.route('**/api/auth/**', stubAuth);
  await registerProductTypesRoute(page);
  await registerSerializedItemsRoute(page);
  await registerTransactionsRoute(page, []);

  await page.goto('/serialized-items');

  await page.getByText('SN-042').click();

  await expect(
    page.getByText(/no history yet for this item|لا يوجد سجل لهذا العنصر بعد/i),
  ).toBeVisible();
});
