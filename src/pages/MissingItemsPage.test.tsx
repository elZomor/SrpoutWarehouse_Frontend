import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { MissingItemsPage } from './MissingItemsPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { MissingItem } from '../features/missing-items/types';
import { apiClient } from '../lib/apiClient';
import { motionDisabledTheme } from '../test/motionDisabledTheme';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeMissingItem(overrides: Partial<MissingItem> = {}): MissingItem {
  return {
    id: 1,
    serial_number: 'SN-042',
    product_type_name: 'Bar LED Model A',
    work_order_id: 17,
    work_order_reference: 'WO-17',
    date_missing: '2026-02-15T10:00:00Z',
    status: 'missing',
    ...overrides,
  };
}

function mockMissingItemsEndpoint(missingItems: MissingItem[]) {
  mockedApiClient.get.mockImplementation((url: string) => {
    if (url !== '/api/missing-items/') {
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    }
    return Promise.resolve({ data: missingItems });
  });
}

function renderMissingItemsPage() {
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

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={motionDisabledTheme}>
          <AntApp>
            <MemoryRouter initialEntries={['/missing-items']}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/missing-items" element={<MissingItemsPage />} />
                  <Route path="/work-orders" element={<div>Work Orders Page</div>} />
                </Route>
                <Route path="/login" element={<div>Login Page</div>} />
              </Routes>
            </MemoryRouter>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('MissingItemsPage', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('lists every missing item with its display fields (AC-1/TC-01)', async () => {
    mockMissingItemsEndpoint([
      makeMissingItem({ id: 1, serial_number: 'SN-042' }),
      makeMissingItem({ id: 2, serial_number: 'SN-099', work_order_reference: 'WO-18' }),
    ]);

    renderMissingItemsPage();

    expect(await screen.findByText('SN-042')).toBeInTheDocument();
    expect(screen.getByText('SN-099')).toBeInTheDocument();
    expect(screen.getAllByText('Bar LED Model A')).toHaveLength(2);
    expect(screen.getByText('WO-17')).toBeInTheDocument();
    expect(screen.getByText('WO-18')).toBeInTheDocument();
    expect(screen.getAllByText(/^missing$|^مفقود$/i)).toHaveLength(2);
  });

  it('links the work order reference to the Work Orders page (TC-04)', async () => {
    mockMissingItemsEndpoint([makeMissingItem()]);

    renderMissingItemsPage();

    const link = await screen.findByRole('link', { name: 'WO-17' });
    expect(link).toHaveAttribute('href', '/work-orders');
  });

  it('combines multiple missing items into one list (TC-05)', async () => {
    mockMissingItemsEndpoint([
      makeMissingItem({ id: 1, serial_number: 'SN-042', work_order_reference: 'WO-17' }),
      makeMissingItem({ id: 2, serial_number: 'SN-099', work_order_reference: 'WO-18' }),
    ]);

    renderMissingItemsPage();

    expect(await screen.findByText('SN-042')).toBeInTheDocument();
    expect(screen.getByText('SN-099')).toBeInTheDocument();
    const rows = screen.getAllByRole('row', { hidden: true }).slice(1);
    expect(rows).toHaveLength(2);
  });

  it('marks an item as found and removes it from the active list (AC-3/TC-02)', async () => {
    const missingItems = [makeMissingItem()];
    mockMissingItemsEndpoint(missingItems);
    mockedApiClient.post.mockImplementationOnce(async () => {
      missingItems.splice(0, 1);
      return { data: { id: 1, status: 'available' } };
    });

    // Popconfirm's rc-motion enter animation leaves the confirm button's
    // pointer-events: none for a moment after it mounts - matches
    // SerializedItemsPage.test.tsx's identical delete-Popconfirm workaround.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMissingItemsPage();

    await screen.findByText('SN-042');
    await user.click(
      screen.getByRole('button', { name: /^mark as found$|^تحديد كموجود$/i, hidden: true }),
    );
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    await waitFor(() =>
      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/missing-items/1/mark-found/'),
    );
    await waitFor(() => expect(screen.queryByText('SN-042')).not.toBeInTheDocument());
  });

  it('invalidates serialized-items and the product-types stock summary after resolving an item', async () => {
    // Resolving a missing item flips the same SerializedItem.status field
    // SerializedItemsPage's list and the Dashboard's stock summary read -
    // matches useBoxes.ts's useCreateBox() precedent of invalidating
    // 'serialized-items' alongside its own key so those views don't sit
    // stale for queryClient's 30s staleTime.
    const missingItems = [makeMissingItem()];
    mockMissingItemsEndpoint(missingItems);
    mockedApiClient.post.mockImplementationOnce(async () => {
      missingItems.splice(0, 1);
      return { data: { id: 1, status: 'available' } };
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { queryClient } = renderMissingItemsPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('SN-042');
    await user.click(
      screen.getByRole('button', { name: /^mark as found$|^تحديد كموجود$/i, hidden: true }),
    );
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['serialized-items'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['product-types', 'stock-summary'],
    });
  });

  it('writes off an item and removes it from the active list (AC-4/TC-03)', async () => {
    const missingItems = [makeMissingItem()];
    mockMissingItemsEndpoint(missingItems);
    mockedApiClient.post.mockImplementationOnce(async () => {
      missingItems.splice(0, 1);
      return { data: { id: 1, status: 'written_off' } };
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMissingItemsPage();

    await screen.findByText('SN-042');
    await user.click(screen.getByRole('button', { name: /^write off$|^شطب$/i, hidden: true }));
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    await waitFor(() =>
      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/missing-items/1/write-off/'),
    );
    await waitFor(() => expect(screen.queryByText('SN-042')).not.toBeInTheDocument());
  });

  it('leaves the item untouched when the mark-as-found confirmation is dismissed', async () => {
    mockMissingItemsEndpoint([makeMissingItem()]);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMissingItemsPage();

    await screen.findByText('SN-042');
    await user.click(
      screen.getByRole('button', { name: /^mark as found$|^تحديد كموجود$/i, hidden: true }),
    );
    await user.click(
      await screen.findByRole('button', { name: /^cancel$|^إلغاء$/i, hidden: true }),
    );

    expect(mockedApiClient.post).not.toHaveBeenCalled();
    expect(screen.getByText('SN-042')).toBeInTheDocument();
  });

  it('shows an error banner when the missing items request fails', async () => {
    mockedApiClient.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    renderMissingItemsPage();

    expect(
      await screen.findByText(/failed to load missing items|فشل تحميل العناصر المفقودة/i),
    ).toBeInTheDocument();
  });

  it('shows an error message when mark-as-found fails', async () => {
    mockMissingItemsEndpoint([makeMissingItem()]);
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: {} },
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMissingItemsPage();

    await screen.findByText('SN-042');
    await user.click(
      screen.getByRole('button', { name: /^mark as found$|^تحديد كموجود$/i, hidden: true }),
    );
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    expect(
      await screen.findByText(/failed to mark item as found|فشل تحديد العنصر كموجود/i),
    ).toBeInTheDocument();
    expect(screen.getByText('SN-042')).toBeInTheDocument();
  });
});
