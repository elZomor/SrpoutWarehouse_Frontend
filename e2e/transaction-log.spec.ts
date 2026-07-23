import { test, expect, type Route } from '@playwright/test';

// This spec mocks the backend entirely via page.route (auth +
// transactions endpoints) rather than assuming a live backend at
// VITE_API_BASE_URL, following work-orders.spec.ts's precedent.
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

function registerTransactionsRoute(
  page: import('@playwright/test').Page,
  transactions: Transaction[],
) {
  return page.route('**/api/transactions/**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const serialNumber = url.searchParams.get('serial_number');
    const referenceNumber = url.searchParams.get('reference_number');
    const transactionType = url.searchParams.get('transaction_type');
    const results = transactions.filter(
      (transaction) =>
        (!serialNumber || transaction.serial_number === serialNumber) &&
        (!referenceNumber || transaction.reference_number === referenceNumber) &&
        (!transactionType || transaction.transaction_type === transactionType),
    );
    await route.fulfill({ status: 200, json: results });
  });
}

test('views the full transaction log, then filters by serial number and type (AC-1/AC-2/AC-5)', async ({
  page,
}) => {
  const transactions: Transaction[] = [
    {
      id: 1,
      transaction_type: 'receive',
      transaction_type_display: 'Receive',
      reference_number: 'PO-1',
      serial_number: 'SN-042',
      product_type_name: 'Bar LED Model A',
      created_at: '2026-02-01T09:00:00Z',
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
      created_at: '2026-02-05T09:00:00Z',
      user_username: 'jane',
      note: '',
    },
    {
      id: 3,
      transaction_type: 'damaged',
      transaction_type_display: 'Damaged',
      reference_number: '',
      serial_number: 'SN-099',
      product_type_name: 'Fog Machine',
      created_at: '2026-02-06T09:00:00Z',
      user_username: 'jane',
      note: 'Cracked lens',
    },
  ];

  await page.route('**/api/auth/**', stubAuth);
  await registerTransactionsRoute(page, transactions);

  await page.goto('/transaction-log');

  await expect(page.getByText('SN-042')).toHaveCount(2);
  await expect(page.getByText('SN-099')).toBeVisible();
  await expect(page.getByText('PO-1')).toBeVisible();
  await expect(page.getByText('WO-1')).toBeVisible();
  await expect(page.getByText('Cracked lens')).toBeVisible();

  // AC-2: filter by serial number.
  await page.getByPlaceholder(/filter by serial number|تصفية حسب الرقم التسلسلي/i).fill('SN-042');
  await expect(page.getByText('SN-099')).not.toBeVisible();
  await expect(page.getByText('SN-042')).toHaveCount(2);

  await page.getByPlaceholder(/filter by serial number|تصفية حسب الرقم التسلسلي/i).fill('');
  await expect(page.getByText('SN-099')).toBeVisible();

  // AC-5: filter by transaction type.
  await page.getByRole('combobox').click();
  await page.getByTitle(/^damaged$|^تالف$/i).click();
  await expect(page.getByText('SN-099')).toBeVisible();
  await expect(page.getByText('SN-042')).not.toBeVisible();
});

test('filters the transaction log by work order reference (AC-3) and shows an empty state with no match (TC-07)', async ({
  page,
}) => {
  const transactions: Transaction[] = [
    {
      id: 1,
      transaction_type: 'issue',
      transaction_type_display: 'Issue',
      reference_number: 'WO-1',
      serial_number: 'SN-042',
      product_type_name: 'Bar LED Model A',
      created_at: '2026-02-05T09:00:00Z',
      user_username: 'jane',
      note: '',
    },
    {
      id: 2,
      transaction_type: 'issue',
      transaction_type_display: 'Issue',
      reference_number: 'WO-2',
      serial_number: 'SN-099',
      product_type_name: 'Fog Machine',
      created_at: '2026-02-06T09:00:00Z',
      user_username: 'jane',
      note: '',
    },
  ];

  await page.route('**/api/auth/**', stubAuth);
  await registerTransactionsRoute(page, transactions);

  await page.goto('/transaction-log');
  await expect(page.getByText('SN-042')).toBeVisible();

  await page.getByPlaceholder(/filter by reference number|تصفية حسب رقم المرجع/i).fill('WO-1');
  await expect(page.getByText('SN-042')).toBeVisible();
  await expect(page.getByText('SN-099')).not.toBeVisible();

  await page
    .getByPlaceholder(/filter by reference number|تصفية حسب رقم المرجع/i)
    .fill('WO-does-not-exist');
  await expect(page.getByText('SN-042')).not.toBeVisible();
  await expect(page.getByText(/no transactions found|لا توجد معاملات/i)).toBeVisible();
});
