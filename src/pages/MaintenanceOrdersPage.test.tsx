import { render, screen, within } from '@testing-library/react';
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

  return render(
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
  );
}

async function selectItemInForm(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = screen.getByRole('dialog', { hidden: true });
  const combobox = within(dialog).getByRole('combobox', { hidden: true });
  await user.click(combobox);
  await user.click(screen.getByTitle(name));
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
      await screen.findByText(/select at least one item|اختر عنصرًا واحدًا على الأقل/i),
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

  it('shows an error banner when the list fails to load', async () => {
    mockListEndpoints({ maintenanceOrdersError: true });

    renderMaintenanceOrdersPage();

    expect(
      await screen.findByText(/failed to load maintenance orders|فشل تحميل أوامر الصيانة/i),
    ).toBeInTheDocument();
  });
});
