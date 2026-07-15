import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
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
    delete: vi.fn(),
  },
}));

// getSerializedItemQrCodeUrl reads env directly (not through apiClient), so
// it needs its own mock rather than piggybacking on the one above - CI has
// no VITE_API_BASE_URL, and env.ts throws at import time without it.
vi.mock('../config/env', () => ({
  env: {
    VITE_API_BASE_URL: 'http://localhost:8000',
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
      <AntApp>
        <MemoryRouter initialEntries={['/serialized-items']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/serialized-items" element={<SerializedItemsPage />} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
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
    // resetAllMocks (not clearAllMocks) - this file chains
    // mockResolvedValueOnce/mockRejectedValueOnce/mockImplementationOnce per
    // test, and clearAllMocks leaves unconsumed once-queues (and the prior
    // test's mockImplementation) in place, bleeding into the next test.
    vi.resetAllMocks();
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

  it('opens a print window with the QR image, serial number and product type when Print QR is clicked', async () => {
    // TC-02/AC-1: the label is built via DOM APIs in a new window (not a
    // raw QR-PNG link) so it carries serial number + product type name
    // alongside the QR code, per AC-1's label content requirement.
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    const printSpy = vi.fn();
    const fakePrintWindow = {
      document: window.document.implementation.createHTMLDocument(),
      focus: vi.fn(),
      print: printSpy,
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakePrintWindow as never);

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /print qr|طباعة رمز qr/i }));

    expect(openSpy).toHaveBeenCalled();
    const img = fakePrintWindow.document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('http://localhost:8000/api/serialized-items/1/qr-code/');
    expect(img?.getAttribute('alt')).toBeTruthy();
    expect(fakePrintWindow.document.body.textContent).toContain('SN-042');
    expect(fakePrintWindow.document.body.textContent).toContain('Bar LED Model A');

    img?.dispatchEvent(new Event('load'));
    expect(printSpy).toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('prints the QR label immediately after registering a new item (AC-4)', async () => {
    // AC-4: the QR is generated on demand (see printLabel.ts / api.ts) rather
    // than stored, so it's never "not ready yet" - printing right after
    // registration must work exactly like printing any other row.
    const serializedItems: SerializedItem[] = [];
    mockListEndpoints({ serializedItems });
    const newItem = makeSerializedItem({ id: 7, serial_number: 'SN-NEW' });
    mockedApiClient.post.mockResolvedValueOnce({ data: newItem });
    const fakePrintWindow = {
      document: window.document.implementation.createHTMLDocument(),
      focus: vi.fn(),
      print: vi.fn(),
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakePrintWindow as never);

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /register item|تسجيل وحدة/i }));
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-NEW');
    await selectProductTypeInForm(user, 'Bar LED Model A');
    serializedItems.push(newItem);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await user.click(await screen.findByRole('button', { name: /print qr|طباعة رمز qr/i }));

    expect(openSpy).toHaveBeenCalled();
    const img = fakePrintWindow.document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('http://localhost:8000/api/serialized-items/7/qr-code/');
    img?.dispatchEvent(new Event('load'));
    expect(fakePrintWindow.print).toHaveBeenCalled();
    expect(fakePrintWindow.document.body.textContent).not.toMatch(/qr not ready/i);

    openSpy.mockRestore();
  });

  it('shows a fallback message in the print window when the QR image fails to load', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    const fakePrintWindow = {
      document: window.document.implementation.createHTMLDocument(),
      focus: vi.fn(),
      print: vi.fn(),
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakePrintWindow as never);

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /print qr|طباعة رمز qr/i }));

    const img = fakePrintWindow.document.querySelector('img');
    img?.dispatchEvent(new Event('error'));

    expect(fakePrintWindow.document.querySelector('img')).toBeNull();
    expect(fakePrintWindow.document.body.textContent).toMatch(
      /failed to load qr code|فشل تحميل رمز qr/i,
    );

    openSpy.mockRestore();
  });

  it('downloads a QR labels PDF scoped to the selected product type filter', async () => {
    // AC-4: "Download QR PDF" while a product type filter is selected only
    // requests that product type's labels.
    mockListEndpoints({
      serializedItems: [makeSerializedItem()],
      productTypes: [makeProductType(), makeProductType({ id: 2, name: 'Fog Machine' })],
    });
    const pdfBlob = new Blob(['%PDF-fake'], { type: 'application/pdf' });
    mockedApiClient.get.mockImplementation(
      (url: string, config?: { params?: { product_type?: number } }) => {
        if (url === '/api/serialized-items/qr-pdf/') {
          expect(config?.params?.product_type).toBe(1);
          return Promise.resolve({ data: pdfBlob });
        }
        if (url === '/api/product-types/') {
          return Promise.resolve({
            data: [makeProductType(), makeProductType({ id: 2, name: 'Fog Machine' })],
          });
        }
        if (url === '/api/serialized-items/') {
          return Promise.resolve({ data: [makeSerializedItem()] });
        }
        return Promise.reject(new Error(`Unexpected GET ${url}`));
      },
    );
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const user = userEvent.setup();
    renderSerializedItemsPage();
    await screen.findByText('SN-042');

    await selectProductTypeFilter(user, 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: /download qr pdf|تنزيل ملصقات qr/i }));

    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalledWith(pdfBlob));
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('shows a generic error message when the QR labels PDF download fails for a real error', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/serialized-items/qr-pdf/') {
        return Promise.reject({ isAxiosError: true, response: { status: 500, data: {} } });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      if (url === '/api/serialized-items/') {
        return Promise.resolve({ data: [makeSerializedItem()] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const user = userEvent.setup();
    renderSerializedItemsPage();
    await screen.findByText('SN-042');

    await user.click(screen.getByRole('button', { name: /download qr pdf|تنزيل ملصقات qr/i }));

    expect(
      await screen.findByText(/failed to download qr labels|فشل تنزيل ملصقات qr/i),
    ).toBeInTheDocument();
  });

  it('shows a "no items to export" message for a product type with zero items (AC-1)', async () => {
    mockListEndpoints({
      serializedItems: [makeSerializedItem()],
      productTypes: [makeProductType(), makeProductType({ id: 2, name: 'Fog Machine' })],
    });
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/serialized-items/qr-pdf/') {
        return Promise.reject({ isAxiosError: true, response: { status: 400, data: {} } });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({
          data: [makeProductType(), makeProductType({ id: 2, name: 'Fog Machine' })],
        });
      }
      if (url === '/api/serialized-items/') {
        return Promise.resolve({ data: [makeSerializedItem()] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const user = userEvent.setup();
    renderSerializedItemsPage();
    await screen.findByText('SN-042');

    await selectProductTypeFilter(user, 'Fog Machine');
    await user.click(screen.getByRole('button', { name: /download qr pdf|تنزيل ملصقات qr/i }));

    expect(
      await screen.findByText(
        /no items to export for this product type|لا توجد عناصر لتصديرها لهذا النوع من المنتجات/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/failed to download qr labels|فشل تنزيل ملصقات qr/i),
    ).not.toBeInTheDocument();
  });

  it('shows a "no items to export" message for "All" when no items exist anywhere (AC-2)', async () => {
    mockListEndpoints({ serializedItems: [] });
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/serialized-items/qr-pdf/') {
        return Promise.reject({ isAxiosError: true, response: { status: 400, data: {} } });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      if (url === '/api/serialized-items/') {
        return Promise.resolve({ data: [] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(
      await screen.findByRole('button', { name: /download qr pdf|تنزيل ملصقات qr/i }),
    );

    expect(
      await screen.findByText(/^no items to export\.?$|^لا توجد عناصر لتصديرها\.?$/i),
    ).toBeInTheDocument();
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
    // AC-1/AC-2: matches on the serial_number field being present in the
    // error response, not on the backend's exact wording (which embeds the
    // submitted serial number and so varies per request).
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { serial_number: ['Serial number SN-042 is already registered.'] },
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

  it('shows a duplicate-serial-number error inline for the DB-constraint race fallback shape', async () => {
    // AC-5: the race-condition fallback returns serial_number as a bare
    // string rather than a list - must still be treated as a duplicate,
    // not fall through to the generic banner.
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { serial_number: 'Serial number SN-042 is already registered.' },
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

  it('shows the generic banner (not the duplicate message) for a whitespace-only serial number', async () => {
    // A single space passes the client-side zod schema (min length 1, no
    // trim), but the backend trims and rejects it as blank - that must not
    // be mislabeled as a duplicate.
    mockListEndpoints({});
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { serial_number: ['Serial number is required.'] },
      },
    });

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /register item|تسجيل وحدة/i }));
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), ' ');
    await selectProductTypeInForm(user, 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to register item|فشل تسجيل الوحدة/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /an item with this serial number is already registered|توجد وحدة مسجلة بهذا الرقم التسلسلي بالفعل/i,
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the generic banner (not the duplicate message) for a too-long serial number', async () => {
    // The backend's 255-char max isn't mirrored client-side; a max-length
    // rejection must not be mislabeled as a duplicate either.
    mockListEndpoints({});
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { serial_number: ['Ensure this field has no more than 255 characters.'] },
      },
    });

    const user = userEvent.setup();
    renderSerializedItemsPage();

    await user.click(await screen.findByRole('button', { name: /register item|تسجيل وحدة/i }));
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042'.repeat(50));
    await selectProductTypeInForm(user, 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to register item|فشل تسجيل الوحدة/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /an item with this serial number is already registered|توجد وحدة مسجلة بهذا الرقم التسلسلي بالفعل/i,
      ),
    ).not.toBeInTheDocument();
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

  it('deletes a serialized item and it no longer appears in the list', async () => {
    // TC-01/AC-1
    // The page fires two GET calls on mount (list + product-types dropdown),
    // so a plain mockResolvedValueOnce on apiClient.get for the post-delete
    // refetch can't target the right one - mutate the shared array instead
    // and let mockListEndpoints' URL-routed implementation pick it up,
    // matching this file's registration test's pattern.
    const serializedItems = [makeSerializedItem()];
    mockListEndpoints({ serializedItems });
    mockedApiClient.delete.mockImplementationOnce(async () => {
      serializedItems.splice(0, 1);
      return { data: undefined };
    });

    // Popconfirm's rc-motion enter animation leaves the confirm button's
    // pointer-events: none for a moment after it mounts - jsdom never
    // finishes the CSS transition, so userEvent's real-click guard sees a
    // stale "not clickable" state and times out. Not a real bug (browsers
    // finish the transition); disable the check for this Popconfirm click.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSerializedItemsPage();

    await screen.findByText('SN-042');
    await user.click(screen.getByRole('button', { name: /^delete$|^حذف$/i }));
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i }));

    await waitFor(() =>
      expect(mockedApiClient.delete).toHaveBeenCalledWith('/api/serialized-items/1/'),
    );
    await waitFor(() => expect(screen.queryByText('SN-042')).not.toBeInTheDocument());
  });

  it('deleting one item leaves a sibling item unaffected', async () => {
    // TC-02/AC-2
    const serializedItems = [
      makeSerializedItem(),
      makeSerializedItem({ id: 2, serial_number: 'SN-043' }),
    ];
    mockListEndpoints({ serializedItems });
    mockedApiClient.delete.mockImplementationOnce(async () => {
      const index = serializedItems.findIndex((item) => item.id === 1);
      serializedItems.splice(index, 1);
      return { data: undefined };
    });

    // See the pointerEventsCheck note above on the delete test.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSerializedItemsPage();

    await screen.findByText('SN-043');
    const row = screen.getByRole('row', { name: /SN-042/ });
    await user.click(within(row).getByRole('button', { name: /^delete$|^حذف$/i }));
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i }));

    await waitFor(() =>
      expect(mockedApiClient.delete).toHaveBeenCalledWith('/api/serialized-items/1/'),
    );
    await waitFor(() => expect(screen.queryByText('SN-042')).not.toBeInTheDocument());
    expect(screen.getByText('SN-043')).toBeInTheDocument();
  });

  it('leaves the item untouched when the delete confirmation is dismissed', async () => {
    // TC-03/AC-3
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSerializedItemsPage();

    await screen.findByText('SN-042');
    await user.click(screen.getByRole('button', { name: /^delete$|^حذف$/i }));
    await user.click(await screen.findByRole('button', { name: /^cancel$|^إلغاء$/i }));

    expect(mockedApiClient.delete).not.toHaveBeenCalled();
    expect(screen.getByText('SN-042')).toBeInTheDocument();
  });

  it('shows an error banner when delete fails', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.delete.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    // See the pointerEventsCheck note above on the delete test.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSerializedItemsPage();

    await screen.findByText('SN-042');
    await user.click(screen.getByRole('button', { name: /^delete$|^حذف$/i }));
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i }));

    expect(await screen.findByText(/failed to delete item|فشل حذف الوحدة/i)).toBeInTheDocument();
    expect(screen.getByText('SN-042')).toBeInTheDocument();
  });
});
