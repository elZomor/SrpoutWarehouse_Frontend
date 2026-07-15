import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { PurchaseOrdersPage } from './PurchaseOrdersPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { ProductType } from '../features/product-types/types';
import type { PurchaseOrder } from '../features/purchase-orders/types';
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

function makePurchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 1,
    supplier_name: 'Acme Lighting Co',
    order_date: '2026-07-01',
    status: 'pending',
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        expected_quantity: 5,
        received_quantity: 0,
        remaining_quantity: 5,
      },
    ],
    ...overrides,
  };
}

// GET calls are routed by URL rather than call order, since the page fires
// both the purchase-orders list query and the product-types dropdown query
// on mount and the two aren't guaranteed to resolve in declaration order.
function mockListEndpoints({
  purchaseOrders = [],
  productTypes = [makeProductType()],
  purchaseOrdersError = false,
}: {
  purchaseOrders?: PurchaseOrder[];
  productTypes?: ProductType[];
  purchaseOrdersError?: boolean;
}) {
  mockedApiClient.get.mockImplementation((url: string) => {
    if (url === '/api/product-types/') {
      return Promise.resolve({ data: productTypes });
    }
    if (url === '/api/purchase-orders/') {
      if (purchaseOrdersError) {
        return Promise.reject({ isAxiosError: true, response: { status: 500, data: {} } });
      }
      return Promise.resolve({ data: purchaseOrders });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

// Simulates the backend's receive endpoint: each POST recomputes
// received/remaining quantities and status from the running scan count,
// mirroring PurchaseOrder.recompute_status() so multi-scan tests (TC-01,
// TC-03/TC-04 partial-then-complete, TC-05 mixed line items) see the same
// progression the real API would return.
function mockReceiveEndpoint(initialPurchaseOrder: PurchaseOrder) {
  let current: PurchaseOrder = structuredClone(initialPurchaseOrder);
  const seenSerialNumbers = new Set<string>();

  mockedApiClient.post.mockImplementation((url: string, body: unknown) => {
    if (url !== `/api/purchase-orders/${current.id}/receive/`) {
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    }
    const { line_item, serial_number } = body as { line_item: number; serial_number: string };

    if (seenSerialNumbers.has(serial_number)) {
      return Promise.reject({
        isAxiosError: true,
        response: {
          status: 400,
          data: { serial_number: [`Serial number ${serial_number} is already registered.`] },
        },
      });
    }
    const targetLineItem = current.line_items.find((item) => item.id === line_item);
    if (targetLineItem && targetLineItem.remaining_quantity <= 0) {
      return Promise.reject({
        isAxiosError: true,
        response: {
          status: 400,
          data: { line_item: ['This line item has already received its expected quantity.'] },
        },
      });
    }

    seenSerialNumbers.add(serial_number);
    const line_items = current.line_items.map((item) =>
      item.id === line_item
        ? {
            ...item,
            received_quantity: item.received_quantity + 1,
            remaining_quantity: item.remaining_quantity - 1,
          }
        : item,
    );
    const status = line_items.every((item) => item.remaining_quantity <= 0)
      ? 'received'
      : line_items.some((item) => item.received_quantity > 0)
        ? 'partially_received'
        : 'pending';
    current = { ...current, line_items, status };
    return Promise.resolve({ data: current });
  });

  return {
    getCurrent: () => current,
  };
}

async function selectReceiveLineItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = screen.getByRole('dialog');
  const combobox = within(dialog).getByRole('combobox');
  await user.click(combobox);
  const option = screen.getAllByTitle(name).at(-1);
  if (!option) {
    throw new Error(`No option found for ${name}`);
  }
  await user.click(option);
}

async function scanSerial(user: ReturnType<typeof userEvent.setup>, serialNumber: string) {
  const input = screen.getByLabelText(/serial number|الرقم التسلسلي/i);
  await user.clear(input);
  await user.type(input, serialNumber);
  await user.click(screen.getByRole('button', { name: /^scan$|^مسح$/i }));
}

function renderPurchaseOrdersPage() {
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
        <MemoryRouter initialEntries={['/purchase-orders']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>,
  );
}

async function fillOrderDate(user: ReturnType<typeof userEvent.setup>, value: string) {
  // {Enter} confirms the typed date and closes only the DatePicker's own
  // popup panel - {Escape} would bubble up and close the whole Modal too,
  // since AntD's Modal also listens for Escape to cancel.
  const dateInput = screen.getByLabelText(/order date|تاريخ الطلب/i);
  await user.type(dateInput, `${value}{Enter}`);
}

async function selectProductTypeForLineItem(
  user: ReturnType<typeof userEvent.setup>,
  lineItemIndex: number,
  name: string,
) {
  const dialog = screen.getByRole('dialog');
  const combobox = within(dialog).getAllByRole('combobox').at(lineItemIndex);
  if (!combobox) {
    throw new Error(`No combobox at index ${lineItemIndex}`);
  }
  await user.click(combobox);
  // AntD keeps earlier dropdowns' option nodes in the DOM (hidden) after
  // close, so a plain getByTitle can match a stale one too once a second
  // line item's dropdown has opened - the freshly opened dropdown's portal
  // is the most recently appended one, so its option is the last match.
  const option = screen.getAllByTitle(name).at(-1);
  if (!option) {
    throw new Error(`No option found for ${name}`);
  }
  await user.click(option);
}

describe('PurchaseOrdersPage', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders purchase orders returned from the API', async () => {
    mockListEndpoints({ purchaseOrders: [makePurchaseOrder()] });

    renderPurchaseOrdersPage();

    expect(await screen.findByText('Acme Lighting Co')).toBeInTheDocument();
    expect(screen.getByText(/pending|قيد الانتظار/i)).toBeInTheDocument();
  });

  it('creates a purchase order with one line item', async () => {
    // TC-01/AC-1
    const purchaseOrders: PurchaseOrder[] = [];
    mockListEndpoints({ purchaseOrders });
    mockedApiClient.post.mockResolvedValueOnce({ data: makePurchaseOrder() });

    // AntD's DatePicker/Select overlays leave a transient pointer-events:
    // none state in jsdom while their rc-motion animation is "finishing"
    // (which jsdom never actually does) - disable the check for every test
    // in this file, matching CategoriesPage's Popconfirm precedent.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new po|أمر شراء جديد/i }));
    await user.type(screen.getByLabelText(/^supplier$|^المورد$/i), 'Acme Lighting Co');
    await fillOrderDate(user, '2026-07-01');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '5');
    purchaseOrders.push(makePurchaseOrder());
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalled());
    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/purchase-orders/', {
      supplier_name: 'Acme Lighting Co',
      order_date: '2026-07-01',
      line_items: [{ product_type: 1, expected_quantity: 5 }],
    });
    expect(await screen.findByText('Acme Lighting Co')).toBeInTheDocument();
  });

  it('creates a purchase order with multiple line items', async () => {
    // TC-02
    const purchaseOrders: PurchaseOrder[] = [];
    const productTypes = [makeProductType(), makeProductType({ id: 2, name: 'Fog Machine' })];
    mockListEndpoints({ purchaseOrders, productTypes });
    mockedApiClient.post.mockResolvedValueOnce({ data: makePurchaseOrder() });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new po|أمر شراء جديد/i }));
    await user.type(screen.getByLabelText(/^supplier$|^المورد$/i), 'Acme Lighting Co');
    await fillOrderDate(user, '2026-07-01');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getAllByPlaceholderText(/qty|الكمية/i)[0]!, '5');

    await user.click(screen.getByRole('button', { name: /add line item|إضافة بند/i }));
    await selectProductTypeForLineItem(user, 1, 'Fog Machine');
    await user.type(screen.getAllByPlaceholderText(/qty|الكمية/i)[1]!, '2');

    purchaseOrders.push(makePurchaseOrder());
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalled());
    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/purchase-orders/', {
      supplier_name: 'Acme Lighting Co',
      order_date: '2026-07-01',
      line_items: [
        { product_type: 1, expected_quantity: 5 },
        { product_type: 2, expected_quantity: 2 },
      ],
    });
  });

  it('requires a supplier name before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new po|أمر شراء جديد/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/supplier is required|المورد مطلوب/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires an order date before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new po|أمر شراء جديد/i }));
    await user.type(screen.getByLabelText(/^supplier$|^المورد$/i), 'Acme Lighting Co');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '5');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/order date is required|تاريخ الطلب مطلوب/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires a product type and quantity on the line item before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new po|أمر شراء جديد/i }));
    await user.type(screen.getByLabelText(/^supplier$|^المورد$/i), 'Acme Lighting Co');
    await fillOrderDate(user, '2026-07-01');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/product type is required|نوع المنتج مطلوب/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/quantity must be at least 1|يجب أن تكون الكمية 1 على الأقل/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('removes an added line item', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new po|أمر شراء جديد/i }));
    await user.click(screen.getByRole('button', { name: /add line item|إضافة بند/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: /remove line item|إزالة البند/i })[0]!);

    expect(within(dialog).getAllByRole('combobox')).toHaveLength(1);
  });

  it('shows a generic error banner when creation fails', async () => {
    mockListEndpoints({});
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new po|أمر شراء جديد/i }));
    await user.type(screen.getByLabelText(/^supplier$|^المورد$/i), 'Acme Lighting Co');
    await fillOrderDate(user, '2026-07-01');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '5');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to create purchase order|فشل إنشاء أمر الشراء/i),
    ).toBeInTheDocument();
  });

  it('shows an error banner when the list fails to load', async () => {
    mockListEndpoints({ purchaseOrdersError: true });

    renderPurchaseOrdersPage();

    expect(
      await screen.findByText(/failed to load purchase orders|فشل تحميل أوامر الشراء/i),
    ).toBeInTheDocument();
  });

  it('fully receives a PO by scanning all expected serials', async () => {
    // TC-01/AC-1
    const purchaseOrder = makePurchaseOrder({
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          expected_quantity: 2,
          received_quantity: 0,
          remaining_quantity: 2,
        },
      ],
    });
    mockListEndpoints({ purchaseOrders: [purchaseOrder] });
    mockReceiveEndpoint(purchaseOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /receive|استلام/i }));
    await selectReceiveLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-1001');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));
    await scanSerial(user, 'SN-1002');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(2));

    expect(mockedApiClient.post).toHaveBeenNthCalledWith(1, '/api/purchase-orders/1/receive/', {
      line_item: 1,
      serial_number: 'SN-1001',
    });
    const dialog = screen.getByRole('dialog');
    const row = await within(dialog).findByRole('row', { name: /bar led model a/i });
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Bar LED Model A', '2', '2', '0']); // expected, received, remaining
  });

  it('deselects a line item once it is fully received, instead of leaving it silently selected', async () => {
    const purchaseOrder = makePurchaseOrder({
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          expected_quantity: 1,
          received_quantity: 0,
          remaining_quantity: 1,
        },
      ],
    });
    mockListEndpoints({ purchaseOrders: [purchaseOrder] });
    mockReceiveEndpoint(purchaseOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /receive|استلام/i }));
    await selectReceiveLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-LAST-001');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/select a line item|اختر بند الطلب/i)).toBeInTheDocument();
  });

  it('shows partially_received status and remaining quantity after a partial scan', async () => {
    // TC-03/AC-3
    const purchaseOrder = makePurchaseOrder({
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          expected_quantity: 3,
          received_quantity: 0,
          remaining_quantity: 3,
        },
      ],
    });
    mockListEndpoints({ purchaseOrders: [purchaseOrder] });
    mockReceiveEndpoint(purchaseOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /receive|استلام/i }));
    await selectReceiveLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-P001');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /done|تم/i }));

    expect(await screen.findByText(/partially received|مستلم جزئيًا/i)).toBeInTheDocument();
  });

  it('completes a partial receipt on reopen', async () => {
    // TC-04/AC-4
    const purchaseOrder = makePurchaseOrder({
      status: 'partially_received',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          expected_quantity: 2,
          received_quantity: 1,
          remaining_quantity: 1,
        },
      ],
    });
    mockListEndpoints({ purchaseOrders: [purchaseOrder] });
    mockReceiveEndpoint(purchaseOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    expect(await screen.findByText(/partially received|مستلم جزئيًا/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /receive|استلام/i }));
    await selectReceiveLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-C002');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /done|تم/i }));

    expect(await screen.findByText(/^received$|^تم الاستلام$/i)).toBeInTheDocument();
  });

  it('stays partially_received when one of two line items is fully scanned and the other is not', async () => {
    // TC-05/AC-5
    const purchaseOrder = makePurchaseOrder({
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          expected_quantity: 1,
          received_quantity: 0,
          remaining_quantity: 1,
        },
        {
          id: 2,
          product_type: 2,
          product_type_name: 'Fog Machine',
          expected_quantity: 2,
          received_quantity: 0,
          remaining_quantity: 2,
        },
      ],
    });
    mockListEndpoints({ purchaseOrders: [purchaseOrder] });
    mockReceiveEndpoint(purchaseOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /receive|استلام/i }));
    await selectReceiveLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-M001');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /done|تم/i }));

    expect(await screen.findByText(/partially received|مستلم جزئيًا/i)).toBeInTheDocument();
  });

  it('shows an inline error for a duplicate serial number scan', async () => {
    const purchaseOrder = makePurchaseOrder();
    mockListEndpoints({ purchaseOrders: [purchaseOrder] });
    mockReceiveEndpoint(purchaseOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPurchaseOrdersPage();

    await user.click(await screen.findByRole('button', { name: /receive|استلام/i }));
    await selectReceiveLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-DUP');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));
    await scanSerial(user, 'SN-DUP');

    expect(await screen.findByText(/already registered|مسجل بالفعل/i)).toBeInTheDocument();
  });
});
