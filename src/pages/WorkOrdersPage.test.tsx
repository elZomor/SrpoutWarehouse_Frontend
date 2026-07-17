import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { WorkOrdersPage } from './WorkOrdersPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { ProductType } from '../features/product-types/types';
import type { ActiveWorkOrder, WorkOrder } from '../features/work-orders/types';
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

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 1,
    job_name: 'Summer Gala',
    client_name: 'Acme Events',
    expected_date_out: '2026-08-01',
    status: 'draft',
    created_by: 1,
    created_by_username: 'jane',
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        quantity: 5,
        scanned_quantity: 0,
        remaining_quantity: 5,
      },
    ],
    ...overrides,
  };
}

function makeActiveWorkOrder(overrides: Partial<ActiveWorkOrder> = {}): ActiveWorkOrder {
  return {
    id: 1,
    job_name: 'Summer Gala',
    client_name: 'Acme Events',
    expected_date_out: '2026-08-01',
    status: 'fulfilled',
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        quantity: 5,
        returned_quantity: 1,
        still_out_quantity: 4,
      },
    ],
    supplementaries: [],
    ...overrides,
  };
}

// GET calls are routed by URL rather than call order, since the page fires
// the work-orders list query, the active-work-orders query, and the
// product-types dropdown query on mount and none are guaranteed to resolve
// in declaration order.
function mockListEndpoints({
  workOrders = [],
  activeWorkOrders = [],
  productTypes = [makeProductType()],
  workOrdersError = false,
}: {
  workOrders?: WorkOrder[];
  activeWorkOrders?: ActiveWorkOrder[];
  productTypes?: ProductType[];
  workOrdersError?: boolean;
}) {
  mockedApiClient.get.mockImplementation((url: string) => {
    if (url === '/api/product-types/') {
      return Promise.resolve({ data: productTypes });
    }
    if (url === '/api/work-orders/active/') {
      return Promise.resolve({ data: activeWorkOrders });
    }
    if (url === '/api/work-orders/') {
      if (workOrdersError) {
        return Promise.reject({ isAxiosError: true, response: { status: 500, data: {} } });
      }
      return Promise.resolve({ data: workOrders });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

// Active is the default tab (it's the story's intended entry point) - most
// existing tests target the Manage tab's create/start/scan flows, so this
// switches there by default. Active-tab tests pass `{ tab: 'active' }` to
// skip the switch.
async function renderWorkOrdersPage({ tab = 'manage' }: { tab?: 'active' | 'manage' } = {}) {
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

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/work-orders']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/work-orders" element={<WorkOrdersPage />} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>,
  );

  if (tab === 'manage') {
    await userEvent.setup().click(await screen.findByRole('tab', { name: /manage|الإدارة/i }));
  }

  return result;
}

async function fillExpectedDateOut(user: ReturnType<typeof userEvent.setup>, value: string) {
  // {Enter} confirms the typed date and closes only the DatePicker's own
  // popup panel - {Escape} would bubble up and close the whole Modal too,
  // since AntD's Modal also listens for Escape to cancel.
  const dateInput = screen.getByLabelText(/expected date out|تاريخ الخروج المتوقع/i);
  await user.type(dateInput, `${value}{Enter}`);
}

// Simulates the backend's start/scan/complete endpoints: each POST mutates
// a shared in-memory WorkOrder and returns the freshly-recomputed object,
// mirroring PurchaseOrdersPage.test.tsx's mockReceiveEndpoint precedent for
// the same kind of scan-gun-driven flow.
function mockFulfillmentEndpoints(initialWorkOrder: WorkOrder) {
  let current: WorkOrder = structuredClone(initialWorkOrder);
  const seenSerialNumbers = new Set<string>();

  mockedApiClient.post.mockImplementation((url: string, body?: unknown) => {
    if (url === `/api/work-orders/${current.id}/start/`) {
      current = { ...current, status: 'in_progress' };
      return Promise.resolve({ data: current });
    }
    if (url === `/api/work-orders/${current.id}/scan/`) {
      const { line_item, serial_number } = body as {
        line_item: number;
        serial_number: string;
      };
      if (seenSerialNumbers.has(serial_number)) {
        return Promise.reject({
          isAxiosError: true,
          response: {
            status: 400,
            data: { serial_number: ['This item is not available to scan.'] },
          },
        });
      }
      const targetLineItem = current.line_items.find((item) => item.id === line_item);
      if (targetLineItem && targetLineItem.remaining_quantity <= 0) {
        return Promise.reject({
          isAxiosError: true,
          response: {
            status: 400,
            data: { line_item: ['This line item has already reached its requested quantity.'] },
          },
        });
      }
      seenSerialNumbers.add(serial_number);
      const line_items = current.line_items.map((item) =>
        item.id === line_item
          ? {
              ...item,
              scanned_quantity: item.scanned_quantity + 1,
              remaining_quantity: item.remaining_quantity - 1,
            }
          : item,
      );
      current = { ...current, line_items };
      return Promise.resolve({ data: current });
    }
    if (url === `/api/work-orders/${current.id}/complete/`) {
      if (current.line_items.some((item) => item.remaining_quantity > 0)) {
        return Promise.reject({
          isAxiosError: true,
          response: {
            status: 400,
            data: {
              status: [
                'All line items must reach their requested quantity before fulfillment can be completed.',
              ],
            },
          },
        });
      }
      current = { ...current, status: 'fulfilled' };
      return Promise.resolve({ data: current });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });

  return {
    getCurrent: () => current,
  };
}

async function selectScanLineItem(user: ReturnType<typeof userEvent.setup>, name: string) {
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
  const dialog = screen.getByRole('dialog');
  const input = screen.getByLabelText(/serial number|الرقم التسلسلي/i);
  await user.clear(input);
  await user.type(input, serialNumber);
  await user.click(within(dialog).getByRole('button', { name: /^scan$|^مسح$/i }));
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

describe('WorkOrdersPage', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders work orders returned from the API', async () => {
    // TC-02/AC-1: job name, client, date, and line items all display.
    mockListEndpoints({ workOrders: [makeWorkOrder()] });

    await renderWorkOrdersPage();

    expect(await screen.findByText('Summer Gala')).toBeInTheDocument();
    expect(screen.getByText('Acme Events')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.getByText(/^draft$|^مسودة$/i)).toBeInTheDocument();
    expect(screen.getByText('jane')).toBeInTheDocument();
    expect(screen.getByText(/Bar LED Model A × 5/)).toBeInTheDocument();
  });

  it('creates a work order with one line item', async () => {
    // TC-01/AC-1
    const workOrders: WorkOrder[] = [];
    mockListEndpoints({ workOrders });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeWorkOrder() });

    // AntD's DatePicker/Select overlays leave a transient pointer-events:
    // none state in jsdom while their rc-motion animation is "finishing"
    // (which jsdom never actually does) - disable the check, matching
    // PurchaseOrdersPage's precedent.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Summer Gala');
    await user.type(screen.getByLabelText(/^client$|^العميل$/i), 'Acme Events');
    await fillExpectedDateOut(user, '2026-08-01');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '5');
    workOrders.push(makeWorkOrder());
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/', {
      job_name: 'Summer Gala',
      client_name: 'Acme Events',
      expected_date_out: '2026-08-01',
      line_items: [{ product_type: 1, quantity: 5 }],
    });
    expect(await screen.findByText('Summer Gala')).toBeInTheDocument();
  });

  it('creates a work order without a client name', async () => {
    // AC-1: client name is optional.
    const workOrders: WorkOrder[] = [];
    mockListEndpoints({ workOrders });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeWorkOrder({ client_name: '' }) });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Summer Gala');
    await fillExpectedDateOut(user, '2026-08-01');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '5');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/', {
      job_name: 'Summer Gala',
      client_name: '',
      expected_date_out: '2026-08-01',
      line_items: [{ product_type: 1, quantity: 5 }],
    });
  });

  it('creates a work order with multiple line items', async () => {
    const workOrders: WorkOrder[] = [];
    const productTypes = [makeProductType(), makeProductType({ id: 2, name: 'Fog Machine' })];
    mockListEndpoints({ workOrders, productTypes });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeWorkOrder() });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Summer Gala');
    await fillExpectedDateOut(user, '2026-08-01');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getAllByPlaceholderText(/qty|الكمية/i)[0]!, '5');

    await user.click(screen.getByRole('button', { name: /add line item|إضافة بند/i }));
    await selectProductTypeForLineItem(user, 1, 'Fog Machine');
    await user.type(screen.getAllByPlaceholderText(/qty|الكمية/i)[1]!, '2');

    workOrders.push(makeWorkOrder());
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/', {
      job_name: 'Summer Gala',
      client_name: '',
      expected_date_out: '2026-08-01',
      line_items: [
        { product_type: 1, quantity: 5 },
        { product_type: 2, quantity: 2 },
      ],
    });
  });

  it('requires a job name before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/job name is required|اسم المهمة مطلوب/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires an expected date out before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Summer Gala');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '5');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/expected date out is required|تاريخ الخروج المتوقع مطلوب/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires a product type and quantity on the line item before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Summer Gala');
    await fillExpectedDateOut(user, '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/product type is required|نوع المنتج مطلوب/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/quantity must be greater than zero|يجب أن تكون الكمية أكبر من صفر/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('removes an added line item', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
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
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Summer Gala');
    await fillExpectedDateOut(user, '2026-08-01');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '5');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to create work order|فشل إنشاء أمر العمل/i),
    ).toBeInTheDocument();
  });

  it('shows an error banner when the list fails to load', async () => {
    mockListEndpoints({ workOrdersError: true });

    await renderWorkOrdersPage();

    expect(
      await screen.findByText(/failed to load work orders|فشل تحميل أوامر العمل/i),
    ).toBeInTheDocument();
  });

  it('starts fulfillment, moving a draft WO to in_progress', async () => {
    // TC-01/AC-1
    const workOrder = makeWorkOrder();
    mockListEndpoints({ workOrders: [workOrder] });
    mockFulfillmentEndpoints(workOrder);

    await renderWorkOrdersPage();

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /start fulfillment|بدء التنفيذ/i }));

    expect(mockedApiClient.post).toHaveBeenCalledWith(`/api/work-orders/${workOrder.id}/start/`);
    expect(await screen.findByText(/^in progress$|^قيد التنفيذ$/i)).toBeInTheDocument();
  });

  // Timeout bumped for the same coverage-instrumentation reason as the
  // "does not show a loading state..." test above (see LESSONS.md) - this
  // test does two full render/interact cycles (start on Manage, then
  // switch to Active), making it one of the heavier tests in this file.
  it('refreshes the Active tab after starting a WO from the Manage tab', async () => {
    // Regression: the Active tab's query is a separate cache from the
    // flat work-orders list and doesn't remount on tab switch (AntD keeps
    // an already-rendered pane mounted) - starting a WO on Manage must
    // invalidate it or the Active tab keeps showing the pre-start status.
    const workOrder = makeWorkOrder({ status: 'draft' });
    let activeStatus: 'draft' | 'in_progress' = 'draft';
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      if (url === '/api/work-orders/active/') {
        return Promise.resolve({ data: [makeActiveWorkOrder({ status: activeStatus })] });
      }
      if (url === '/api/work-orders/') {
        return Promise.resolve({ data: [workOrder] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    mockedApiClient.post.mockImplementation((url: string) => {
      if (url === `/api/work-orders/${workOrder.id}/start/`) {
        activeStatus = 'in_progress';
        return Promise.resolve({ data: { ...workOrder, status: 'in_progress' } });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    await renderWorkOrdersPage();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /start fulfillment|بدء التنفيذ/i }));
    // AntD keeps both tab panes mounted (not unmounted) once rendered,
    // but marks the inactive one `aria-hidden="true"`, which
    // findByRole/getByRole exclude by default - so scoping to a row here
    // isn't strictly required to disambiguate, but keeps the assertion
    // pinned to the Manage table specifically rather than "wherever a
    // matching row happens to be found".
    const manageRow = await screen.findByRole('row', { name: /summer gala/i });
    await within(manageRow).findByText(/^in progress$|^قيد التنفيذ$/i);

    await userEvent.setup().click(screen.getByRole('tab', { name: /active|النشطة/i }));

    const activeRow = await screen.findByRole('row', { name: /summer gala/i });
    expect(await within(activeRow).findByText(/^in progress$|^قيد التنفيذ$/i)).toBeInTheDocument();
  }, 40000);

  it('shows a toast when starting fulfillment fails, leaving the WO as draft', async () => {
    const workOrder = makeWorkOrder();
    mockListEndpoints({ workOrders: [workOrder] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { status: ['Only a draft work order can start fulfillment.'] },
      },
    });

    await renderWorkOrdersPage();

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /start fulfillment|بدء التنفيذ/i }));

    expect(
      await screen.findByText(/failed to start fulfillment|فشل بدء التنفيذ/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/^draft$|^مسودة$/i)).toBeInTheDocument();
  });

  // Timeout bumped like the known Popconfirm/rc-motion flake (see
  // LESSONS.md) - this page grew a Tabs + two extra Table instances for
  // WRH-55, and under `--coverage` instrumentation this specific test's
  // render + interaction cost reliably crosses Vitest's default 10s
  // timeout (observed ~27-30s under coverage) even though it's not
  // otherwise slow and passes well under 1s without coverage.
  it('does not show a loading state on other draft rows when starting one WO', async () => {
    // Efficiency/altitude regression: a shared mutation instance must not
    // spin every draft row's button when only one row's start is pending.
    const workOrderA = makeWorkOrder({ id: 1, job_name: 'Job A' });
    const workOrderB = makeWorkOrder({ id: 2, job_name: 'Job B' });
    mockListEndpoints({ workOrders: [workOrderA, workOrderB] });
    // Never resolves within this test - keeps workOrderA's start pending.
    mockedApiClient.post.mockImplementationOnce(() => new Promise(() => {}));

    await renderWorkOrdersPage();

    const rowA = await screen.findByRole('row', { name: /job a/i });
    await userEvent.setup().click(within(rowA).getByRole('button'));

    const rowB = screen.getByRole('row', { name: /job b/i });
    expect(within(rowB).getByRole('button')).toBeEnabled();
  }, 45000);

  it('updates the live counter as items are scanned', async () => {
    // TC-02/AC-2
    const workOrder = makeWorkOrder({
      status: 'in_progress',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 3,
          scanned_quantity: 0,
          remaining_quantity: 3,
        },
      ],
    });
    mockListEndpoints({ workOrders: [workOrder] });
    mockFulfillmentEndpoints(workOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-1001');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));
    await scanSerial(user, 'SN-1002');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(2));

    expect(mockedApiClient.post).toHaveBeenNthCalledWith(1, `/api/work-orders/1/scan/`, {
      line_item: 1,
      serial_number: 'SN-1001',
    });
    const dialog = screen.getByRole('dialog');
    const row = await within(dialog).findByRole('row', { name: /bar led model a/i });
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Bar LED Model A', '3', '2', '1']); // requested, scanned, remaining
  });

  it('disables Complete Fulfillment until every line item is fully scanned, then completes', async () => {
    // TC-04/AC-4
    const workOrder = makeWorkOrder({
      status: 'in_progress',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 1,
          scanned_quantity: 0,
          remaining_quantity: 1,
        },
      ],
    });
    mockListEndpoints({ workOrders: [workOrder] });
    mockFulfillmentEndpoints(workOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    const completeButton = screen.getByRole('button', {
      name: /complete fulfillment|إتمام التنفيذ/i,
    });
    expect(completeButton).toBeDisabled();

    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-2001');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));

    expect(completeButton).toBeEnabled();
    await user.click(completeButton);

    expect(mockedApiClient.post).toHaveBeenCalledWith(`/api/work-orders/1/complete/`);
    expect(await screen.findByText(/^fulfilled$|^تم التنفيذ$/i)).toBeInTheDocument();
  });

  it('shows a toast when completing fulfillment fails, keeping the modal open', async () => {
    const workOrder = makeWorkOrder({
      status: 'in_progress',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 1,
          scanned_quantity: 1,
          remaining_quantity: 0,
        },
      ],
    });
    mockListEndpoints({ workOrders: [workOrder] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { status: ['All line items must reach their requested quantity...'] },
      },
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await user.click(screen.getByRole('button', { name: /complete fulfillment|إتمام التنفيذ/i }));

    expect(
      await screen.findByText(/failed to complete fulfillment|فشل إتمام التنفيذ/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows an inline error for a duplicate/unavailable serial scan', async () => {
    const workOrder = makeWorkOrder({
      status: 'in_progress',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 2,
          scanned_quantity: 0,
          remaining_quantity: 2,
        },
      ],
    });
    mockListEndpoints({ workOrders: [workOrder] });
    mockFulfillmentEndpoints(workOrder);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-DUP');
    await waitFor(() => expect(mockedApiClient.post).toHaveBeenCalledTimes(1));
    await scanSerial(user, 'SN-DUP');

    expect(await screen.findByText(/not available to scan|غير متاح للمسح/i)).toBeInTheDocument();
  });

  // AC-1/TC-01, AC-3/TC-03, AC-4/TC-04: each rejects with a distinct,
  // status-specific serial_number error - mockScanRejection stands in for
  // mockFulfillmentEndpoints' generic scan mock so each test can supply the
  // exact message WorkOrderViewSet.scan() (WRH-33) returns for its case.
  function mockScanRejection(workOrder: WorkOrder, message: string) {
    mockedApiClient.post.mockImplementation((url: string) => {
      if (url === `/api/work-orders/${workOrder.id}/scan/`) {
        return Promise.reject({
          isAxiosError: true,
          response: { status: 400, data: { serial_number: [message] } },
        });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });
  }

  it('shows "serial not found" for an unregistered serial', async () => {
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(workOrder, 'Serial not found');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-NOPE');

    expect(
      await screen.findByText(/no item found with this serial number|لا يوجد عنصر/i),
    ).toBeInTheDocument();
  });

  it('names the other work order when the scanned item is already out', async () => {
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(workOrder, 'SN-042 is currently out on WO-17');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-042');

    expect(await screen.findByText(/WO-17/)).toBeInTheDocument();
  });

  it('names the other work order when the scanned item is already reserved there', async () => {
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(workOrder, 'SN-043 is already reserved on WO-22');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-043');

    expect(await screen.findByText(/WO-22/)).toBeInTheDocument();
  });

  it('parses the WO reference from the end of the message, not a WO-shaped serial number', async () => {
    // Regression: serial_number is unconstrained free text - an unanchored
    // WO-id regex could grab a "WO-<n>"-shaped substring from inside the
    // scanned serial itself instead of the real reference the backend
    // always appends last.
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(workOrder, 'WO-99-BATT is currently out on WO-17');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'WO-99-BATT');

    // If the WO-id regex weren't anchored to the message's end, it would
    // grab "99" out of the serial itself instead of the real "17".
    expect(await screen.findByText(/WO-17/)).toBeInTheDocument();
  });

  it("classifies a damaged item correctly even if its serial embeds another reason's phrase", async () => {
    // Regression: the backend always appends the true reason last
    // (`${serial_number} ${reason}`), so an unanchored .includes() check
    // for one reason's phrase could match against text that's actually
    // part of the *serial number*, not the real reason - misclassifying a
    // damaged item as "out" (with an undefined WO id) if its serial
    // happened to contain "is currently out on".
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(workOrder, 'SN-is currently out on-77 is damaged and cannot be issued');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-is currently out on-77');

    expect(
      await screen.findByText(/is damaged and cannot be issued|تالف ولا يمكن صرفه/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/currently out on WO-undefined/)).not.toBeInTheDocument();
  });

  it("doesn't misclassify an out item as a product-type mismatch when its serial embeds that phrase", async () => {
    // Regression: productTypeMismatchError's real backend message is a
    // fixed constant with no serial_number in it - but the pre-fix check
    // did a substring search against the *whole* rejection message, which
    // for out/reserved/damaged/missing does start with the free-text
    // serial_number. A colliding serial could get swallowed by this
    // earlier, unrelated check before ever reaching the real out/reserved/
    // damaged/missing classification.
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(
      workOrder,
      "SN-does not match this line item's product type.-77 is currently out on WO-17",
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, "SN-does not match this line item's product type.-77");

    expect(await screen.findByText(/WO-17/)).toBeInTheDocument();
  });

  it('shows a product-type-mismatch error for a genuine mismatch', async () => {
    // AC-2/TC-02: the positive case for productTypeMismatchError - the
    // regression test above only covers a colliding serial resolving to a
    // *different* classification, not this branch actually firing on its
    // own real backend message.
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(workOrder, "Item does not match this line item's product type.");

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-200');

    expect(
      await screen.findByText(
        /does not match the selected line item's product type|لا يطابق نوع منتج البند المحدد/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows a damaged-specific error for a damaged item', async () => {
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(workOrder, 'SN-099 is damaged and cannot be issued');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-099');

    expect(
      await screen.findByText(/is damaged and cannot be issued|تالف ولا يمكن صرفه/i),
    ).toBeInTheDocument();
  });

  it('shows a missing-specific error for a missing item', async () => {
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints({ workOrders: [workOrder] });
    mockScanRejection(workOrder, 'SN-100 is missing and cannot be issued');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-100');

    expect(
      await screen.findByText(/is missing and cannot be issued|مفقود ولا يمكن صرفه/i),
    ).toBeInTheDocument();
  });

  it('shows an empty state on the Active tab when no active work orders exist', async () => {
    // TC-04/AC-4
    mockListEndpoints({});

    await renderWorkOrdersPage({ tab: 'active' });

    expect(
      await screen.findByText(/no active work orders found|لا توجد أوامر عمل نشطة/i),
    ).toBeInTheDocument();
  });

  it('renders an active work order with per-type returned/still-out counts', async () => {
    // TC-02/AC-2
    mockListEndpoints({ activeWorkOrders: [makeActiveWorkOrder()] });

    await renderWorkOrdersPage({ tab: 'active' });

    expect(await screen.findByText('Summer Gala')).toBeInTheDocument();
    expect(screen.getByText('Acme Events')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.getByText(/^fulfilled$|^تم التنفيذ$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Bar LED Model A: 1 (returned|تم إرجاعه) \/ 4 (still out|لا يزال خارجًا)/i),
    ).toBeInTheDocument();
  });

  it('nests supplementaries beneath their Primary work order', async () => {
    // TC-01/AC-1
    const primary = makeActiveWorkOrder({
      supplementaries: [
        makeActiveWorkOrder({ id: 2, job_name: 'Supplementary A', supplementaries: [] }),
        makeActiveWorkOrder({ id: 3, job_name: 'Supplementary B', supplementaries: [] }),
      ],
    });
    mockListEndpoints({ activeWorkOrders: [primary] });

    await renderWorkOrdersPage({ tab: 'active' });

    await screen.findByText('Summer Gala');
    expect(screen.queryByText('Supplementary A')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /expand row/i }));

    expect(await screen.findByText('Supplementary A')).toBeInTheDocument();
    expect(screen.getByText('Supplementary B')).toBeInTheDocument();
  });

  it('drills into a work order to show exact serials and their statuses', async () => {
    // TC-03/AC-3
    mockListEndpoints({ activeWorkOrders: [makeActiveWorkOrder()] });
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/work-orders/active/') {
        return Promise.resolve({ data: [makeActiveWorkOrder()] });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      if (url === '/api/work-orders/1/') {
        return Promise.resolve({
          data: {
            id: 1,
            job_name: 'Summer Gala',
            client_name: 'Acme Events',
            expected_date_out: '2026-08-01',
            status: 'fulfilled',
            created_by: 1,
            created_by_username: 'jane',
            parent_work_order: null,
            line_items: [
              {
                id: 1,
                product_type: 1,
                product_type_name: 'Bar LED Model A',
                quantity: 1,
                serialized_items: [{ id: 1, serial_number: 'SN-0001', status: 'out' }],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    await renderWorkOrdersPage({ tab: 'active' });

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /view details|عرض التفاصيل/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('SN-0001')).toBeInTheDocument();
    expect(within(dialog).getByText(/^out$|^خارج$/i)).toBeInTheDocument();
  });
});
