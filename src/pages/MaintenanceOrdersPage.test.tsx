import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { MaintenanceOrdersPage } from './MaintenanceOrdersPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { MaintenanceOrder } from '../features/maintenance-orders/types';
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

// This page's item picker pulls in useSerializedItems -> serialized-items/
// api.ts, which reads env directly (not through apiClient) - matches
// BoxesPage.test.tsx/SerializedItemsPage.test.tsx's identical env mock,
// since CI has no VITE_API_BASE_URL and env.ts throws at import time
// without it.
vi.mock('../config/env', () => ({
  env: {
    VITE_API_BASE_URL: 'http://localhost:8000',
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeSerializedItem(overrides: Partial<SerializedItem> = {}): SerializedItem {
  return {
    id: 1,
    serial: '35acd300-e1d1-4cfd-87c0-daad35911605',
    serial_number: 'SN-042',
    product_type: 1,
    product_type_name: 'Bar LED Model A',
    status: 'damaged',
    last_work_order_reference: '',
    notes: '',
    ...overrides,
  };
}

function makeMaintenanceOrder(overrides: Partial<MaintenanceOrder> = {}): MaintenanceOrder {
  return {
    id: 1,
    reference: 'MO-0001',
    status: 'open',
    items: [{ id: 1, serial_number: 'SN-042', status: 'in_maintenance' }],
    ...overrides,
  };
}

function mockListEndpoints({
  maintenanceOrders = [],
  serializedItems = [],
  maintenanceOrdersError = false,
}: {
  maintenanceOrders?: MaintenanceOrder[];
  serializedItems?: SerializedItem[];
  maintenanceOrdersError?: boolean;
}) {
  mockedApiClient.get.mockImplementation((url: string) => {
    if (url === '/api/maintenance-orders/') {
      if (maintenanceOrdersError) {
        return Promise.reject({ isAxiosError: true, response: { status: 500, data: {} } });
      }
      return Promise.resolve({ data: maintenanceOrders });
    }
    if (url === '/api/serialized-items/') {
      return Promise.resolve({ data: serializedItems });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

function renderMaintenanceOrdersPage() {
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
            <MemoryRouter initialEntries={['/maintenance-orders']}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/maintenance-orders" element={<MaintenanceOrdersPage />} />
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

async function selectItemInForm(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = screen.getByRole('dialog', { hidden: true });
  const combobox = within(dialog).getByRole('combobox', { hidden: true });
  await user.click(combobox);
  await user.click(screen.getByTitle(name));
}

// Line items (and their resolve actions) live behind the row's expand
// toggle - matches WorkOrdersPage.active.test.tsx's identical "expand row"
// interaction for its own parent/line-item nested Table.
async function expandFirstRow(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('MO-0001');
  await user.click(screen.getByRole('button', { name: /expand row/i, hidden: true }));
}

describe('MaintenanceOrdersPage', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders maintenance orders returned from the API', async () => {
    // TC-01/AC-1
    mockListEndpoints({ maintenanceOrders: [makeMaintenanceOrder()] });

    renderMaintenanceOrdersPage();

    expect(await screen.findByText('MO-0001')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /MO-0001/, hidden: true });
    expect(within(row).getByText('1')).toBeInTheDocument();
  });

  it('creates a maintenance order from selected damaged items and it appears in the list', async () => {
    // TC-01/AC-1: MO-0001 created, status "open", 3 items become line items.
    const maintenanceOrders: MaintenanceOrder[] = [];
    mockListEndpoints({
      maintenanceOrders,
      serializedItems: [makeSerializedItem()],
    });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeMaintenanceOrder() });

    const user = userEvent.setup();
    renderMaintenanceOrdersPage();

    await user.click(
      await screen.findByRole('button', {
        name: /create maintenance order|إنشاء أمر صيانة/i,
        hidden: true,
      }),
    );
    await selectItemInForm(user, 'SN-042');
    maintenanceOrders.push(makeMaintenanceOrder());
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/maintenance-orders/', {
      item_ids: [1],
    });
    expect(await screen.findByText('MO-0001')).toBeInTheDocument();
  });

  it('only offers damaged items in the item picker', async () => {
    mockListEndpoints({
      serializedItems: [
        makeSerializedItem({ id: 1, serial_number: 'SN-DAMAGED', status: 'damaged' }),
        makeSerializedItem({ id: 2, serial_number: 'SN-AVAILABLE', status: 'available' }),
      ],
    });

    const user = userEvent.setup();
    renderMaintenanceOrdersPage();

    await user.click(
      await screen.findByRole('button', {
        name: /create maintenance order|إنشاء أمر صيانة/i,
        hidden: true,
      }),
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    const combobox = within(dialog).getByRole('combobox', { hidden: true });
    await user.click(combobox);

    expect(screen.getByTitle('SN-DAMAGED')).toBeInTheDocument();
    expect(screen.queryByTitle('SN-AVAILABLE')).not.toBeInTheDocument();
  });

  it('requires at least one item before submitting', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });

    const user = userEvent.setup();
    renderMaintenanceOrdersPage();

    await user.click(
      await screen.findByRole('button', {
        name: /create maintenance order|إنشاء أمر صيانة/i,
        hidden: true,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(
      await screen.findByText(
        /select at least one damaged item|اختر عنصرًا تالفًا واحدًا على الأقل/i,
      ),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('shows a generic error banner when creation fails', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const user = userEvent.setup();
    renderMaintenanceOrdersPage();

    await user.click(
      await screen.findByRole('button', {
        name: /create maintenance order|إنشاء أمر صيانة/i,
        hidden: true,
      }),
    );
    await selectItemInForm(user, 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(
      await screen.findByText(/failed to create maintenance order|فشل إنشاء أمر الصيانة/i),
    ).toBeInTheDocument();
  });

  it('shows a translated, interpolated message when an item is already on another maintenance order', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { item_ids: ['SN-042 is already on maintenance order MO-0001'] },
      },
    });

    const user = userEvent.setup();
    renderMaintenanceOrdersPage();

    await user.click(
      await screen.findByRole('button', {
        name: /create maintenance order|إنشاء أمر صيانة/i,
        hidden: true,
      }),
    );
    await selectItemInForm(user, 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(
      await screen.findByText(
        /SN-042 is already on maintenance order MO-0001|SN-042 موجود بالفعل في أمر الصيانة MO-0001/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/failed to create maintenance order|فشل إنشاء أمر الصيانة/i),
    ).not.toBeInTheDocument();
  });

  it('shows a translated, interpolated message when an item is rejected for not being damaged', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { item_ids: ['SN-042 must be damaged to be added to a maintenance order'] },
      },
    });

    const user = userEvent.setup();
    renderMaintenanceOrdersPage();

    await user.click(
      await screen.findByRole('button', {
        name: /create maintenance order|إنشاء أمر صيانة/i,
        hidden: true,
      }),
    );
    await selectItemInForm(user, 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(
      await screen.findByText(
        /SN-042 must be damaged to be added to a maintenance order|SN-042 يجب أن يكون تالفًا لإضافته إلى أمر صيانة/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/failed to create maintenance order|فشل إنشاء أمر الصيانة/i),
    ).not.toBeInTheDocument();
  });

  it('shows an error banner when the list fails to load', async () => {
    mockListEndpoints({ maintenanceOrdersError: true });

    renderMaintenanceOrdersPage();

    expect(
      await screen.findByText(/failed to load maintenance orders|فشل تحميل أوامر الصيانة/i),
    ).toBeInTheDocument();
  });

  it('marks a line item as fixed - item goes available, MO goes in_progress (AC-1/TC-01)', async () => {
    const maintenanceOrder = makeMaintenanceOrder({
      items: [
        { id: 1, serial_number: 'SN-042', status: 'in_maintenance' },
        { id: 2, serial_number: 'SN-099', status: 'in_maintenance' },
      ],
    });
    const maintenanceOrders = [maintenanceOrder];
    mockListEndpoints({ maintenanceOrders });
    mockedApiClient.post.mockImplementationOnce(async () => {
      maintenanceOrder.status = 'in_progress';
      maintenanceOrder.items = [
        { id: 1, serial_number: 'SN-042', status: 'available' },
        { id: 2, serial_number: 'SN-099', status: 'in_maintenance' },
      ];
      return { data: maintenanceOrder };
    });

    // Popconfirm's rc-motion enter animation leaves the confirm button's
    // pointer-events: none for a moment after it mounts - matches
    // MissingItemsPage.test.tsx's identical resolve-Popconfirm workaround.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMaintenanceOrdersPage();

    await expandFirstRow(user);
    await screen.findByText('SN-042');
    const [markFixedButton] = screen.getAllByRole('button', {
      name: /^mark fixed$|^تحديد كمُصلح$/i,
      hidden: true,
    });
    await user.click(markFixedButton!);
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/maintenance-orders/1/resolve/', {
      item_id: 1,
      resolution: 'fixed',
    });
    expect(await screen.findByText(/^available$|^متاح$/i)).toBeInTheDocument();
    expect(await screen.findByText(/^in progress$|^قيد التنفيذ$/i)).toBeInTheDocument();
  });

  it('disables the sibling resolve action on the same item while a request is in flight', async () => {
    // Regression: a plain resolveMutation.mutate() call left onConfirm not
    // returning a promise, so antd's Popconfirm closed before isPending
    // could ever flip true - and even once fixed to mutateAsync, antd's
    // own loading state is scoped to just the one clicked ActionButton, not
    // this row's *other* action. Without an explicit `disabled` keyed off
    // isPending for this item, "Mark Not Fixable" stayed clickable while
    // "Mark Fixed" was still in flight for the same item, letting both fire
    // concurrently.
    const maintenanceOrder = makeMaintenanceOrder();
    mockListEndpoints({ maintenanceOrders: [maintenanceOrder] });
    let resolvePost!: () => void;
    mockedApiClient.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePost = () => resolve({ data: maintenanceOrder });
        }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMaintenanceOrdersPage();

    await expandFirstRow(user);
    await screen.findByText('SN-042');
    await user.click(
      screen.getByRole('button', { name: /^mark fixed$|^تحديد كمُصلح$/i, hidden: true }),
    );
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /^mark not fixable$|^تحديد كغير قابل للإصلاح$/i,
          hidden: true,
        }),
      ).toBeDisabled(),
    );

    resolvePost();
  });

  it('marks a line item as not fixable - item goes written_off (AC-2/TC-02)', async () => {
    const maintenanceOrder = makeMaintenanceOrder();
    const maintenanceOrders = [maintenanceOrder];
    mockListEndpoints({ maintenanceOrders });
    mockedApiClient.post.mockImplementationOnce(async () => {
      maintenanceOrder.status = 'completed';
      maintenanceOrder.items = [{ id: 1, serial_number: 'SN-042', status: 'written_off' }];
      return { data: maintenanceOrder };
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMaintenanceOrdersPage();

    await expandFirstRow(user);
    await screen.findByText('SN-042');
    await user.click(
      screen.getByRole('button', {
        name: /^mark not fixable$|^تحديد كغير قابل للإصلاح$/i,
        hidden: true,
      }),
    );
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/maintenance-orders/1/resolve/', {
      item_id: 1,
      resolution: 'not_fixable',
    });
    expect(await screen.findByText(/^written off$|^شطب$/i)).toBeInTheDocument();
  });

  it('shows the MO as completed once every line item is resolved (AC-3/TC-03/TC-04)', async () => {
    const maintenanceOrder = makeMaintenanceOrder({
      status: 'in_progress',
      items: [
        { id: 1, serial_number: 'SN-042', status: 'available' },
        { id: 2, serial_number: 'SN-099', status: 'in_maintenance' },
      ],
    });
    const maintenanceOrders = [maintenanceOrder];
    mockListEndpoints({ maintenanceOrders });
    mockedApiClient.post.mockImplementationOnce(async () => {
      maintenanceOrder.status = 'completed';
      maintenanceOrder.items = [
        { id: 1, serial_number: 'SN-042', status: 'available' },
        { id: 2, serial_number: 'SN-099', status: 'written_off' },
      ];
      return { data: maintenanceOrder };
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMaintenanceOrdersPage();

    await expandFirstRow(user);
    await screen.findByText('SN-099');
    await user.click(
      screen.getByRole('button', {
        name: /^mark not fixable$|^تحديد كغير قابل للإصلاح$/i,
        hidden: true,
      }),
    );
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    expect(await screen.findByText(/^completed$|^مكتمل$/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^mark fixed$|^تحديد كمُصلح$/i, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /^mark not fixable$|^تحديد كغير قابل للإصلاح$/i,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });

  it('does not offer resolve actions for an already-resolved item', async () => {
    mockListEndpoints({
      maintenanceOrders: [
        makeMaintenanceOrder({
          items: [{ id: 1, serial_number: 'SN-042', status: 'available' }],
        }),
      ],
    });

    const user = userEvent.setup();
    renderMaintenanceOrdersPage();

    await expandFirstRow(user);
    await screen.findByText('SN-042');
    expect(
      screen.queryByRole('button', { name: /^mark fixed$|^تحديد كمُصلح$/i, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /^mark not fixable$|^تحديد كغير قابل للإصلاح$/i,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });

  it('shows a generic error banner when resolving fails', async () => {
    mockListEndpoints({ maintenanceOrders: [makeMaintenanceOrder()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMaintenanceOrdersPage();

    await expandFirstRow(user);
    await screen.findByText('SN-042');
    await user.click(
      screen.getByRole('button', { name: /^mark fixed$|^تحديد كمُصلح$/i, hidden: true }),
    );
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    expect(await screen.findByText(/failed to resolve item|فشل حل العنصر/i)).toBeInTheDocument();
  });

  it('invalidates serialized-items and the product-types stock summary after resolving an item', async () => {
    // Resolving flips SerializedItem.status - the same field
    // SerializedItemsPage's list and the Dashboard's stock summary read,
    // matching MissingItemsPage.test.tsx's identical invalidation
    // assertion for the sibling resolve flow.
    const maintenanceOrder = makeMaintenanceOrder();
    mockListEndpoints({ maintenanceOrders: [maintenanceOrder] });
    mockedApiClient.post.mockImplementationOnce(async () => {
      maintenanceOrder.status = 'completed';
      maintenanceOrder.items = [{ id: 1, serial_number: 'SN-042', status: 'available' }];
      return { data: maintenanceOrder };
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { queryClient } = renderMaintenanceOrdersPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await expandFirstRow(user);
    await screen.findByText('SN-042');
    await user.click(
      screen.getByRole('button', { name: /^mark fixed$|^تحديد كمُصلح$/i, hidden: true }),
    );
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['serialized-items'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['product-types', 'stock-summary'],
    });
  });
});
