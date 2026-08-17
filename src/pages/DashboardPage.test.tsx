import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { DashboardPage } from './DashboardPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { ProductTypeStockSummary } from '../features/product-types/types';
import type { SerializedItem } from '../features/serialized-items/types';
import { apiClient } from '../lib/apiClient';
import { motionDisabledTheme } from '../test/motionDisabledTheme';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// The drill-down modal pulls in useSerializedItems -> serialized-items/api.ts,
// which reads env directly (not through apiClient) for
// getSerializedItemQrCodeUrl - needs its own mock, matching
// SerializedItemsPage.test.tsx's identical precedent: CI has no
// VITE_API_BASE_URL, and env.ts throws at import time without it.
vi.mock('../config/env', () => ({
  env: {
    VITE_API_BASE_URL: 'http://localhost:8000',
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeStockSummaryRow(
  overrides: Partial<ProductTypeStockSummary> = {},
): ProductTypeStockSummary {
  return {
    id: 1,
    name: 'Bar LED Model A',
    total_registered: 4,
    out: 1,
    damaged: 1,
    missing: 1,
    available: 1,
    written_off: 0,
    ...overrides,
  };
}

// GET calls are routed by URL, matching WorkOrdersPage.test.tsx's
// mockListEndpoints precedent - the stock-summary query and the drill-down
// modal's serialized-items query are both real GET calls this page fires.
function mockGetEndpoints({
  stockSummary = [],
  serializedItems = [],
}: {
  stockSummary?: ProductTypeStockSummary[];
  serializedItems?: SerializedItem[];
}) {
  mockedApiClient.get.mockImplementation((url: string) => {
    if (url === '/api/product-types/stock-summary/') {
      return Promise.resolve({ data: stockSummary });
    }
    if (url === '/api/serialized-items/') {
      return Promise.resolve({ data: serializedItems });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

function renderDashboardPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(currentUserQueryKey, {
    id: 1,
    username: 'jane',
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={motionDisabledTheme}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the welcome message and the logged-in user's name", async () => {
    mockGetEndpoints({});
    renderDashboardPage();

    expect(
      screen.getByText(/Welcome to Sprout Warehouse|مرحبًا بك في سبروت للمخازن/),
    ).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockedApiClient.get).toHaveBeenCalledWith('/api/product-types/stock-summary/'),
    );
  });

  it('logs out and redirects to the login page', async () => {
    mockGetEndpoints({});
    mockedApiClient.post.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    renderDashboardPage();

    await user.click(screen.getByRole('button', { name: /logout|تسجيل الخروج/i, hidden: true }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/auth/logout/');
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });

  it('shows total registered, out, damaged, missing, and available counts per product type', async () => {
    // AC-1/TC-01
    mockGetEndpoints({ stockSummary: [makeStockSummaryRow()] });

    renderDashboardPage();

    const row = await screen.findByRole('row', { name: /bar led model a/i, hidden: true });
    const cells = within(row)
      .getAllByRole('cell', { hidden: true })
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Bar LED Model A', '4', '1', '1', '1', '1', '0']);
  });

  it('shows Available exactly as returned by the backend (AC-2)', async () => {
    // AC-2/TC-02: 100 total, 30 out, 5 damaged, 2 missing -> Available 62 -
    // the backend computes this; the page just displays it.
    mockGetEndpoints({
      stockSummary: [
        makeStockSummaryRow({
          total_registered: 100,
          out: 30,
          damaged: 5,
          missing: 2,
          available: 62,
          written_off: 1,
        }),
      ],
    });

    renderDashboardPage();

    const row = await screen.findByRole('row', { name: /bar led model a/i, hidden: true });
    expect(within(row).getByText('62')).toBeInTheDocument();
  });

  it('shows the written-off count per product type (WRH-74/AC-2)', async () => {
    mockGetEndpoints({
      stockSummary: [makeStockSummaryRow({ written_off: 3 })],
    });

    renderDashboardPage();

    expect(await screen.findByText(/written-off|مشطوب/i, { selector: 'th' })).toBeInTheDocument();
    const row = await screen.findByRole('row', { name: /bar led model a/i, hidden: true });
    const cells = within(row)
      .getAllByRole('cell', { hidden: true })
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Bar LED Model A', '4', '1', '1', '1', '1', '3']);
  });

  it('drills into a product type to show its serials and statuses', async () => {
    // AC-3/TC-03
    mockGetEndpoints({
      stockSummary: [makeStockSummaryRow()],
      serializedItems: [
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
      ],
    });
    const user = userEvent.setup();
    renderDashboardPage();

    await user.click(await screen.findByRole('row', { name: /bar led model a/i, hidden: true }));

    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText('SN-0001')).toBeInTheDocument();
    expect(within(dialog).getByText(/^available$|^متاح$/i)).toBeInTheDocument();
    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/serialized-items/', {
      params: { search: undefined, product_type: 1 },
    });
  });

  it('gives each stock status its own distinct color in the drill-down (WRH-76/AC-1/AC-2/AC-4)', async () => {
    mockGetEndpoints({
      stockSummary: [makeStockSummaryRow()],
      serializedItems: [
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
        {
          id: 2,
          serial: 'b',
          serial_number: 'SN-0002',
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          status: 'damaged',
          last_work_order_reference: '',
          notes: '',
        },
        {
          id: 3,
          serial: 'c',
          serial_number: 'SN-0003',
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          status: 'written_off',
          last_work_order_reference: '',
          notes: '',
        },
        {
          id: 4,
          serial: 'd',
          serial_number: 'SN-0004',
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          status: 'reserved',
          last_work_order_reference: '',
          notes: '',
        },
      ],
    });
    const user = userEvent.setup();
    renderDashboardPage();

    await user.click(await screen.findByRole('row', { name: /bar led model a/i, hidden: true }));
    const dialog = await screen.findByRole('dialog', { hidden: true });

    const tagClassFor = (text: RegExp) =>
      within(dialog).getByText(text).closest('.ant-tag')?.className;
    const availableClass = tagClassFor(/^available$|^متاح$/i);
    const damagedClass = tagClassFor(/^damaged$|^تالف$/i);
    const writtenOffClass = tagClassFor(/^written off$|^شطب$/i);
    const reservedClass = tagClassFor(/^reserved$|^محجوز$/i);

    const classes = [availableClass, damagedClass, writtenOffClass, reservedClass];
    expect(classes.every(Boolean)).toBe(true);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it('refetches the stock summary when the refresh button is clicked', async () => {
    // AC-4/TC-04
    mockGetEndpoints({ stockSummary: [makeStockSummaryRow()] });
    const user = userEvent.setup();
    renderDashboardPage();
    await screen.findByRole('row', { name: /bar led model a/i, hidden: true });
    const callsBeforeRefresh = mockedApiClient.get.mock.calls.filter(
      ([url]) => url === '/api/product-types/stock-summary/',
    ).length;

    await user.click(screen.getByRole('button', { name: /refresh|تحديث/i, hidden: true }));

    await waitFor(() => {
      const callsAfterRefresh = mockedApiClient.get.mock.calls.filter(
        ([url]) => url === '/api/product-types/stock-summary/',
      ).length;
      expect(callsAfterRefresh).toBeGreaterThan(callsBeforeRefresh);
    });
  });

  it('shows all zeros for a product type with no registered items', async () => {
    // AC-5/TC-05
    mockGetEndpoints({
      stockSummary: [
        makeStockSummaryRow({
          total_registered: 0,
          out: 0,
          damaged: 0,
          missing: 0,
          available: 0,
          written_off: 0,
        }),
      ],
    });

    renderDashboardPage();

    const row = await screen.findByRole('row', { name: /bar led model a/i, hidden: true });
    const cells = within(row)
      .getAllByRole('cell', { hidden: true })
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Bar LED Model A', '0', '0', '0', '0', '0', '0']);
  });

  it('shows an empty state when no product types exist', async () => {
    // AC-6/TC-06
    mockGetEndpoints({ stockSummary: [] });

    renderDashboardPage();

    expect(
      await screen.findByText(/no product types found|لا توجد أنواع منتجات/i),
    ).toBeInTheDocument();
  });

  it('shows an error banner when the stock summary fails to load', async () => {
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/product-types/stock-summary/') {
        return Promise.reject(new Error('network error'));
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    renderDashboardPage();

    expect(
      await screen.findByText(/failed to load stock summary|فشل تحميل ملخص المخزون/i),
    ).toBeInTheDocument();
  });
});
