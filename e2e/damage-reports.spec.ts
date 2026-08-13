import { test, expect, type Route } from '@playwright/test';

// Mocks the backend entirely via page.route (auth + damage-reports
// endpoints), following missing-items.spec.ts's precedent.
const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

interface DamageReport {
  id: number;
  reference: string;
  serial_number: string;
  product_type_name: string;
  note: string;
  user_username: string;
  created_at: string;
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

function registerDamageReportsRoute(
  page: import('@playwright/test').Page,
  damageReports: DamageReport[],
) {
  return page.route('**/api/damage-reports/**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({ status: 200, json: damageReports });
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON() as { serial_number: string; note?: string };
      if (body.serial_number === 'SN-UNKNOWN') {
        await route.fulfill({
          status: 400,
          json: { serial_number: [`Serial number ${body.serial_number} was not found.`] },
        });
        return;
      }
      const report: DamageReport = {
        id: damageReports.length + 1,
        reference: `DR-000${damageReports.length + 1}`,
        serial_number: body.serial_number,
        product_type_name: 'Bar LED Model A',
        note: body.note ?? '',
        user_username: 'jane',
        created_at: '2026-02-15T10:00:00Z',
      };
      damageReports.push(report);
      await route.fulfill({ status: 201, json: report });
      return;
    }

    await route.continue();
  });
}

test('creates a damage report with a note, then a second without one, and both appear in the list (AC-1/AC-2/AC-3/TC-01,02,03,04)', async ({
  page,
}) => {
  const damageReports: DamageReport[] = [];

  await page.route('**/api/auth/**', stubAuth);
  await registerDamageReportsRoute(page, damageReports);

  await page.goto('/damage-reports');
  await expect(page.getByText(/no damage reports found|لا توجد تقارير تلف/i)).toBeVisible();

  await page.getByRole('button', { name: /new damage report|تقرير تلف جديد/i }).click();
  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-042');
  await page.getByLabel(/note|ملاحظة/i).fill('cracked housing');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('DR-0001')).toBeVisible();
  await expect(page.getByText('SN-042')).toBeVisible();
  await expect(page.getByText('cracked housing')).toBeVisible();

  // AC-3/TC-02: a second report with no note - TC-04's sequential numbering.
  await page.getByRole('button', { name: /new damage report|تقرير تلف جديد/i }).click();
  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-099');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('DR-0002')).toBeVisible();
  await expect(page.getByText('SN-099')).toBeVisible();
});

test('shows an inline error when the serial number was not found', async ({ page }) => {
  const damageReports: DamageReport[] = [];

  await page.route('**/api/auth/**', stubAuth);
  await registerDamageReportsRoute(page, damageReports);

  await page.goto('/damage-reports');

  await page.getByRole('button', { name: /new damage report|تقرير تلف جديد/i }).click();
  await page.getByLabel(/serial number|الرقم التسلسلي/i).fill('SN-UNKNOWN');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(
    page.getByText(/serial number was not found|لم يتم العثور على الرقم التسلسلي/i),
  ).toBeVisible();
});
