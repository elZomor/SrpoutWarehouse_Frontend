import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SerializedItemsPage } from './SerializedItemsPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { ProductType } from '../features/product-types/types';
import type { SerializedItem } from '../features/serialized-items/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeProductType(overrides: Partial<ProductType> = {}): ProductType {
  return {
    id: 1,
    name: 'Bar LED Model A',
    model_code: 'BAR-A',
    description: '',
    category: 1,
    category_name: 'Lighting',
    ...overrides,
  };
}

function makeSerializedItem(overrides: Partial<SerializedItem> = {}): SerializedItem {
  return {
    id: 1,
    serial: '35acd300-e1d1-4cfd-87c0-daad35911605',
    serial_number: 'SN-042',
    product_type: 1,
    product_type_name: 'Bar LED Model A',
    status: 'available',
    qr_code: 'http://testserver/media/qr_codes/35acd300-e1d1-4cfd-87c0-daad35911605.png',
    last_work_order_reference: '',
    notes: '',
    ...overrides,
  };
}

// GET calls are routed by URL rather than call order, since the page fires
// both the serialized-items list query and the product-types dropdown
// query on mount and the two aren't guaranteed to resolve in declaration
// order.
function mockListEndpoints({
  serializedItems = [],
  productTypes = [makeProductType()],
  serializedItemsError = false,
}: {
  serializedItems?: SerializedItem[];
  productTypes?: ProductType[];
  serializedItemsError?: boolean;
}) {
  mockedApiClient.get.mockImplementation(
    (url: string, config?: { params?: { search?: string; product_type?: number } }) => {
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: productTypes });
      }
      if (url === '/api/serialized-items/') {
        if (serializedItemsError) {
          return Promise.reject({ isAxiosError: true, response: { status: 500, data: {} } });
        }
        const search = config?.params?.search?.toLowerCase() ?? '';
        const productTypeFilter = config?.params?.product_type;
        const results = serializedItems.filter(
          (item) =>
            item.serial_number.toLowerCase().includes(search) &&
            (productTypeFilter == null || item.product_type === productTypeFilter),
        );
        return Promise.resolve({ data: results });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    },
  );
}

function renderSerializedItemsPage() {
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
      <MemoryRouter initialEntries={['/serialized-items']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/serialized-items" element={<SerializedItemsPage />} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Two comboboxes can be on screen at once (the page-level filter and the
// registration form's dropdown inside the modal dialog), so scope to the
// modal when it's open rather than assuming a single combobox exists.
async function selectProductTypeInForm(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('combobox'));
  await user.click(screen.getByTitle(name));
}

async function selectProductTypeFilter(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox'));
  await user.click(screen.getByTitle(name));
}

describe('SerializedItemsPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders serialized items returned from the API', async () => {
    // TC-03
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });

    renderSerializedItemsPage();

    expect(await screen.findByText('SN-042')).toBeInTheDocument();
    expect(screen.getByText('Bar LED Model A')).toBeInTheDocument();
  });

  it('registers a serialized item and it appears in the list with status available', async () => {
    // TC-01/AC-1
    const serializedItems: SerializedItem[] = [];
    mockListEndpoints({ serializedItems });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeSerializedItem() });

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /register item|تسجيل وحدة/i }));
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    await selectProductTypeInForm(user, 'Bar LED Model A');
    serializedItems.push(makeSerializedItem());
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/serialized-items/', {
      serial_number: 'SN-042',
      product_type: 1,
    });
    expect(await screen.findByText('SN-042')).toBeInTheDocument();
    expect(screen.getByText(/available|متاح/i)).toBeInTheDocument();
  });

  it('shows a QR code Print link for a registered item', async () => {
    // TC-02
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });

    renderSerializedItemsPage();

    const printLink = await screen.findByRole('link', { name: /print qr|طباعة رمز qr/i });
    expect(printLink).toHaveAttribute(
      'href',
      'http://testserver/media/qr_codes/35acd300-e1d1-4cfd-87c0-daad35911605.png',
    );
  });

  it('requires a serial number before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /register item|تسجيل وحدة/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/serial number is required|الرقم التسلسلي مطلوب/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires a product type before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /register item|تسجيل وحدة/i }));
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/product type is required|نوع المنتج مطلوب/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('shows a duplicate-serial-number error inline when registration fails on a duplicate', async () => {
    // AC-2
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { serial_number: ['serialized item with this serial number already exists.'] },
      },
    });

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /register item|تسجيل وحدة/i }));
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    await selectProductTypeInForm(user, 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(
        /an item with this serial number is already registered|توجد وحدة مسجلة بهذا الرقم التسلسلي بالفعل/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows a generic error banner when registration fails for another reason', async () => {
    mockListEndpoints({});
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /register item|تسجيل وحدة/i }));
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    await selectProductTypeInForm(user, 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to register item|فشل تسجيل الوحدة/i),
    ).toBeInTheDocument();
  });

  it('shows an error banner when the list fails to load', async () => {
    mockListEndpoints({ serializedItemsError: true });

    renderSerializedItemsPage();

    expect(
      await screen.findByText(/failed to load serialized items|فشل تحميل الوحدات المسجلة/i),
    ).toBeInTheDocument();
  });

  it('filters the list when searching by serial number', async () => {
    // TC-04/TC-05
    mockListEndpoints({
      serializedItems: [
        makeSerializedItem(),
        makeSerializedItem({ id: 2, serial_number: 'AB-999' }),
      ],
    });

    renderSerializedItemsPage();
    await screen.findByText('AB-999');

    const searchInput = screen.getByPlaceholderText(
      /search by serial number|البحث بالرقم التسلسلي/i,
    );
    fireEvent.change(searchInput, { target: { value: 'SN-0' } });

    await waitFor(() =>
      expect(mockedApiClient.get).toHaveBeenLastCalledWith('/api/serialized-items/', {
        params: { search: 'SN-0', product_type: undefined },
      }),
    );
    await waitFor(() => expect(screen.queryByText('AB-999')).not.toBeInTheDocument());
    expect(screen.getByText('SN-042')).toBeInTheDocument();
  });

  it('shows an empty state when the search has no matches', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });

    renderSerializedItemsPage();
    await screen.findByText('SN-042');

    const searchInput = screen.getByPlaceholderText(
      /search by serial number|البحث بالرقم التسلسلي/i,
    );
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(
      await screen.findByText(/no serialized items found|لا توجد وحدات مسجلة/i),
    ).toBeInTheDocument();
  });

  it('filters the list by product type', async () => {
    // AC-3
    mockListEndpoints({
      serializedItems: [
        makeSerializedItem(),
        makeSerializedItem({
          id: 2,
          serial_number: 'FOG-001',
          product_type: 2,
          product_type_name: 'Fog Machine',
        }),
      ],
      productTypes: [makeProductType(), makeProductType({ id: 2, name: 'Fog Machine' })],
    });

    const user = userEvent.setup();
    renderSerializedItemsPage();
    await screen.findByText('FOG-001');

    await selectProductTypeFilter(user, 'Fog Machine');

    await waitFor(() => expect(screen.queryByText('SN-042')).not.toBeInTheDocument());
    expect(screen.getByText('FOG-001')).toBeInTheDocument();
  });
});
