import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { BoxesPage } from './BoxesPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { Box } from '../features/boxes/types';
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

// getBoxQrCodeUrl reads env directly (not through apiClient) - matches
// SerializedItemsPage.test.tsx's identical env mock, since CI has no
// VITE_API_BASE_URL and env.ts throws at import time without it.
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

function makeBox(overrides: Partial<Box> = {}): Box {
  return {
    id: 1,
    code: 'BX-001',
    uuid: 'b7a6c8e0-6b7a-4b7a-8b7a-6b7a4b7a8b7a',
    product_type: 1,
    product_type_name: 'Bar LED Model A',
    items: [{ id: 1, serial_number: 'SN-042', status: 'available' }],
    ...overrides,
  };
}

// GET calls are routed by URL (+ product_type param for serialized-items),
// since the page fires the boxes list, product-types dropdown, and (once a
// product type is picked) the serialized-items queries - not guaranteed to
// resolve in declaration order. Matches SerializedItemsPage.test.tsx's
// identical routing approach.
function mockListEndpoints({
  boxes = [],
  productTypes = [makeProductType()],
  serializedItems = [],
  boxesError = false,
}: {
  boxes?: Box[];
  productTypes?: ProductType[];
  serializedItems?: SerializedItem[];
  boxesError?: boolean;
}) {
  mockedApiClient.get.mockImplementation(
    (url: string, config?: { params?: { product_type?: number } }) => {
      if (url === '/api/boxes/') {
        if (boxesError) {
          return Promise.reject({ isAxiosError: true, response: { status: 500, data: {} } });
        }
        return Promise.resolve({ data: boxes });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: productTypes });
      }
      if (url === '/api/serialized-items/') {
        const productTypeFilter = config?.params?.product_type;
        const results = serializedItems.filter(
          (item) => productTypeFilter == null || item.product_type === productTypeFilter,
        );
        return Promise.resolve({ data: results });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    },
  );
}

function renderBoxesPage() {
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
        <MemoryRouter initialEntries={['/boxes']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/boxes" element={<BoxesPage />} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>,
  );
}

async function selectInForm(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = screen.getByRole('dialog');
  const comboboxes = within(dialog).getAllByRole('combobox');
  await user.click(comboboxes[0]!);
  await user.click(screen.getByTitle(name));
}

async function selectItemInForm(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = screen.getByRole('dialog');
  const comboboxes = within(dialog).getAllByRole('combobox');
  await user.click(comboboxes[1]!);
  await user.click(screen.getByTitle(name));
}

describe('BoxesPage', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders boxes returned from the API', async () => {
    // TC-01/AC-1
    mockListEndpoints({ boxes: [makeBox()] });

    renderBoxesPage();

    expect(await screen.findByText('BX-001')).toBeInTheDocument();
    expect(screen.getByText('Bar LED Model A')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /BX-001/ });
    expect(within(row).getByText('1')).toBeInTheDocument();
  });

  it('registers a box with selected items and it appears in the list', async () => {
    // TC-01/AC-1
    const boxes: Box[] = [];
    mockListEndpoints({
      boxes,
      serializedItems: [makeSerializedItem()],
    });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeBox() });

    const user = userEvent.setup();
    renderBoxesPage();

    await user.click(await screen.findByRole('button', { name: /register box|تسجيل صندوق/i }));
    await user.type(screen.getByLabelText(/box code|رمز الصندوق/i), 'BX-001');
    await selectInForm(user, 'Bar LED Model A');
    await selectItemInForm(user, 'SN-042');
    boxes.push(makeBox());
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/boxes/', {
      code: 'BX-001',
      product_type: 1,
      item_ids: [1],
    });
    expect(await screen.findByText('BX-001')).toBeInTheDocument();
  });

  it('opens a print window with the QR image and box code when Print QR is clicked', async () => {
    mockListEndpoints({ boxes: [makeBox()] });
    const printSpy = vi.fn();
    const fakePrintWindow = {
      document: window.document.implementation.createHTMLDocument(),
      focus: vi.fn(),
      print: printSpy,
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakePrintWindow as never);

    const user = userEvent.setup();
    renderBoxesPage();

    await user.click(await screen.findByRole('button', { name: /print qr|طباعة رمز qr/i }));

    expect(openSpy).toHaveBeenCalled();
    const img = fakePrintWindow.document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('http://localhost:8000/api/boxes/1/qr-code/');
    expect(fakePrintWindow.document.body.textContent).toContain('BX-001');
    expect(fakePrintWindow.document.body.textContent).toContain('Bar LED Model A');

    img?.dispatchEvent(new Event('load'));
    expect(printSpy).toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('requires a box code before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup();
    renderBoxesPage();

    await user.click(await screen.findByRole('button', { name: /register box|تسجيل صندوق/i }));
    await selectInForm(user, 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/box code is required|رمز الصندوق مطلوب/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires a product type before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup();
    renderBoxesPage();

    await user.click(await screen.findByRole('button', { name: /register box|تسجيل صندوق/i }));
    await user.type(screen.getByLabelText(/box code|رمز الصندوق/i), 'BX-001');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/product type is required|نوع المنتج مطلوب/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires at least one item before submitting', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });

    const user = userEvent.setup();
    renderBoxesPage();

    await user.click(await screen.findByRole('button', { name: /register box|تسجيل صندوق/i }));
    await user.type(screen.getByLabelText(/box code|رمز الصندوق/i), 'BX-001');
    await selectInForm(user, 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/select at least one item|اختر عنصرًا واحدًا على الأقل/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('shows a generic error banner when registration fails', async () => {
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const user = userEvent.setup();
    renderBoxesPage();

    await user.click(await screen.findByRole('button', { name: /register box|تسجيل صندوق/i }));
    await user.type(screen.getByLabelText(/box code|رمز الصندوق/i), 'BX-001');
    await selectInForm(user, 'Bar LED Model A');
    await selectItemInForm(user, 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to register box|فشل تسجيل الصندوق/i),
    ).toBeInTheDocument();
  });

  it('shows the specific server message when an item is rejected', async () => {
    // WRH-27/AC-1/AC-2/AC-5: item_ids rejections name a specific item (and
    // possibly another box) - shown verbatim rather than the generic banner.
    mockListEndpoints({ serializedItems: [makeSerializedItem()] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { item_ids: ['SN-042 is already in box BX-001'] },
      },
    });

    const user = userEvent.setup();
    renderBoxesPage();

    await user.click(await screen.findByRole('button', { name: /register box|تسجيل صندوق/i }));
    await user.type(screen.getByLabelText(/box code|رمز الصندوق/i), 'BX-002');
    await selectInForm(user, 'Bar LED Model A');
    await selectItemInForm(user, 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText('SN-042 is already in box BX-001')).toBeInTheDocument();
    expect(screen.queryByText(/failed to register box|فشل تسجيل الصندوق/i)).not.toBeInTheDocument();
  });

  it('shows an error banner when the list fails to load', async () => {
    mockListEndpoints({ boxesError: true });

    renderBoxesPage();

    expect(await screen.findByText(/failed to load boxes|فشل تحميل الصناديق/i)).toBeInTheDocument();
  });
});
