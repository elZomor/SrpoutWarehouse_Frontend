import { test, expect, type Route } from '@playwright/test';

// Mocks the backend entirely via page.route (auth + missing-items
// endpoints), following transaction-log.spec.ts's precedent.
const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

interface MissingItem {
  id: number;
  serial_number: string;
  product_type_name: string;
  work_order_id: number | null;
  work_order_reference: string;
  date_missing: string | null;
  status: string;
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

function registerMissingItemsRoute(
  page: import('@playwright/test').Page,
  missingItems: MissingItem[],
) {
  return page.route('**/api/missing-items/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const foundMatch = url.pathname.match(/\/api\/missing-items\/(\d+)\/mark-found\/$/);
    const writeOffMatch = url.pathname.match(/\/api\/missing-items\/(\d+)\/write-off\/$/);

    if (method === 'GET' && url.pathname === '/api/missing-items/') {
      await route.fulfill({ status: 200, json: missingItems });
      return;
    }

    if (method === 'POST' && foundMatch) {
      const id = Number(foundMatch[1]);
      const index = missingItems.findIndex((item) => item.id === id);
      if (index !== -1) {
        missingItems.splice(index, 1);
      }
      await route.fulfill({ status: 200, json: { id, status: 'available' } });
      return;
    }

    if (method === 'POST' && writeOffMatch) {
      const id = Number(writeOffMatch[1]);
      const index = missingItems.findIndex((item) => item.id === id);
      if (index !== -1) {
        missingItems.splice(index, 1);
      }
      await route.fulfill({ status: 200, json: { id, status: 'written_off' } });
      return;
    }

    await route.continue();
  });
}

test('views the missing items list, then resolves one as found and one as written off (AC-1/AC-3/AC-4/TC-01,02,03,04,05)', async ({
  page,
}) => {
  const missingItems: MissingItem[] = [
    {
      id: 1,
      serial_number: 'SN-042',
      product_type_name: 'Bar LED Model A',
      work_order_id: 17,
      work_order_reference: 'WO-17',
      date_missing: '2026-02-01T09:00:00Z',
      status: 'missing',
    },
    {
      id: 2,
      serial_number: 'SN-099',
      product_type_name: 'Fog Machine',
      work_order_id: 18,
      work_order_reference: 'WO-18',
      date_missing: '2026-02-06T09:00:00Z',
      status: 'missing',
    },
  ];

  await page.route('**/api/auth/**', stubAuth);
  await registerMissingItemsRoute(page, missingItems);

  await page.goto('/missing-items');

  // AC-1/TC-01/TC-05: both items from two different WOs listed together.
  await expect(page.getByText('SN-042')).toBeVisible();
  await expect(page.getByText('SN-099')).toBeVisible();
  await expect(page.getByText('Bar LED Model A')).toBeVisible();
  await expect(page.getByText('Fog Machine')).toBeVisible();

  // WRH-70/TC-04: the WO reference deep-links straight to that WO's own
  // detail URL, not just the Work Orders list.
  const workOrderLink = page.getByRole('link', { name: 'WO-17' });
  await expect(workOrderLink).toHaveAttribute('href', '/work-orders/17');

  // AC-3/TC-02: mark SN-042 as found - it disappears from the active list.
  await page
    .getByRole('row', { name: /SN-042/ })
    .getByRole('button', { name: /^mark as found$|^تحديد كموجود$/i })
    .click();
  await page.getByRole('button', { name: /^ok$|^موافق$/i }).click();
  await expect(page.getByText('SN-042')).not.toBeVisible();
  await expect(page.getByText('SN-099')).toBeVisible();

  // AC-4/TC-03: write off SN-099 - it disappears from the active list too.
  await page
    .getByRole('row', { name: /SN-099/ })
    .getByRole('button', { name: /^write off$|^شطب$/i })
    .click();
  await page.getByRole('button', { name: /^ok$|^موافق$/i }).click();
  await expect(page.getByText('SN-099')).not.toBeVisible();
  await expect(page.getByText(/no missing items|لا توجد عناصر مفقودة/i)).toBeVisible();
});
