import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkOrder } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';
import {
  makeActiveWorkOrder,
  makeProductType,
  makeWorkOrder,
  mockListEndpoints,
  renderWorkOrdersPage,
} from './workOrdersTestSupport';

// Split out of WorkOrdersPage.test.tsx (WRH-34) - see workOrdersTestSupport's
// header comment. This file covers the Manage tab's start/scan/complete
// fulfillment flow - the single heaviest section of the original file, so
// it gets its own worker/process again instead of sharing one with every
// other WorkOrdersPage concern.

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

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

// WRH-26/AC-2/AC-3: scan-box() only - mockFulfillmentEndpoints' generic
// scan/complete mocks aren't needed for these, matching mockScanRejection's
// identical POST-only-mock precedent.
function mockScanBox(workOrder: WorkOrder, response: unknown) {
  mockedApiClient.post.mockImplementation((url: string) => {
    if (url === `/api/work-orders/${workOrder.id}/scan-box/`) {
      return Promise.resolve({ data: response });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

function mockScanBoxRejection(workOrder: WorkOrder, field: string, message: string) {
  mockedApiClient.post.mockImplementation((url: string) => {
    if (url === `/api/work-orders/${workOrder.id}/scan-box/`) {
      return Promise.reject({
        isAxiosError: true,
        response: { status: 400, data: { [field]: [message] } },
      });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

async function scanBox(user: ReturnType<typeof userEvent.setup>, boxCode: string) {
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).getByLabelText(/box code|رمز الصندوق/i);
  await user.clear(input);
  await user.type(input, boxCode);
  await user.click(within(dialog).getByRole('button', { name: /^scan box$|^مسح صندوق$/i }));
}

describe('WorkOrdersPage - fulfillment', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('starts fulfillment, moving a draft WO to in_progress', async () => {
    // TC-01/AC-1
    const workOrder = makeWorkOrder();
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
    mockFulfillmentEndpoints(workOrder);

    await renderWorkOrdersPage();

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /start fulfillment|بدء التنفيذ/i }));

    expect(mockedApiClient.post).toHaveBeenCalledWith(`/api/work-orders/${workOrder.id}/start/`);
    expect(await screen.findByText(/^in progress$|^قيد التنفيذ$/i)).toBeInTheDocument();
  });

  // Timeout bumped - this test does two full render/interact cycles (start
  // on Manage, then switch to Active), measured ~48s in isolation even
  // after splitting this file out of the original WorkOrdersPage.test.tsx
  // (WRH-34), with no coverage instrumentation involved. Real per-test
  // render cost, not a file-size or coverage artifact.
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
  }, 150000);

  it('shows a toast when starting fulfillment fails, leaving the WO as draft', async () => {
    const workOrder = makeWorkOrder();
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
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

  it('does not show a loading state on other draft rows when starting one WO', async () => {
    // Efficiency/altitude regression: a shared mutation instance must not
    // spin every draft row's button when only one row's start is pending.
    const workOrderA = makeWorkOrder({ id: 1, job_name: 'Job A' });
    const workOrderB = makeWorkOrder({ id: 2, job_name: 'Job B' });
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrderA, workOrderB] });
    // Never resolves within this test - keeps workOrderA's start pending.
    mockedApiClient.post.mockImplementationOnce(() => new Promise(() => {}));

    await renderWorkOrdersPage();

    const rowA = await screen.findByRole('row', { name: /job a/i });
    await userEvent.setup().click(within(rowA).getByRole('button'));

    const rowB = screen.getByRole('row', { name: /job b/i });
    expect(within(rowB).getByRole('button')).toBeEnabled();
  });

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
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
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
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
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
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
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

  // Every scan-rejection classification case except the one below (kept as
  // a thin wiring-proof - see logic.ts's header comment on why exactly one
  // survives per classifier-covered flow) moved to
  // src/features/work-orders/logic.test.ts: duplicate/unavailable scan,
  // "serial not found", already-reserved, WO-id-regex-anchoring regression,
  // damaged-item-embedding-another-reason's-phrase regression,
  // out-item-embedding-mismatch-phrase regression, product-type mismatch,
  // damaged, missing.
  it('names the other work order when the scanned item is already out', async () => {
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
    mockScanRejection(workOrder, 'SN-042 is currently out on WO-17');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await selectScanLineItem(user, 'Bar LED Model A');
    await scanSerial(user, 'SN-042');

    expect(await screen.findByText(/WO-17/)).toBeInTheDocument();
  });

  it('scans a box and reserves every item inside, showing the expansion summary', async () => {
    // WRH-26/AC-2/AC-3
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
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
    mockScanBox(workOrder, {
      work_order: {
        ...workOrder,
        line_items: [{ ...workOrder.line_items[0], scanned_quantity: 3, remaining_quantity: 0 }],
      },
      box_summary: {
        code: 'BX-001',
        added: 3,
        results: [
          { serial_number: 'SN-1001', added: true, reason: '' },
          { serial_number: 'SN-1002', added: true, reason: '' },
          { serial_number: 'SN-1003', added: true, reason: '' },
        ],
      },
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await scanBox(user, 'BX-001');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/1/scan-box/', {
      box_code: 'BX-001',
    });
    expect(
      await screen.findByText(/box bx-001 expanded: 3 items added|تم توسيع الصندوق bx-001/i),
    ).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    const row = await within(dialog).findByRole('row', { name: /bar led model a/i });
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Bar LED Model A', '3', '3', '0']);
  });

  it('reports a rejected item in the box scan summary without blocking the rest', async () => {
    // WRH-26/AC-2: "each validated individually"
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
    mockScanBox(workOrder, {
      work_order: {
        ...workOrder,
        line_items: [{ ...workOrder.line_items[0], scanned_quantity: 1, remaining_quantity: 4 }],
      },
      box_summary: {
        code: 'BX-002',
        added: 1,
        results: [
          { serial_number: 'SN-2001', added: true, reason: '' },
          { serial_number: 'SN-2002', added: false, reason: 'SN-2002 is not available to scan' },
        ],
      },
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await scanBox(user, 'BX-002');

    expect(
      await screen.findByText(
        /box bx-002 expanded: 1 items added \(1 flagged\)|تم توسيع الصندوق bx-002/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/SN-2002 is not available to scan/i)).toBeInTheDocument();
  });

  it('shows an inline error when scanning an unknown box code', async () => {
    const workOrder = makeWorkOrder({ status: 'in_progress' });
    mockListEndpoints(mockedApiClient.get, { workOrders: [workOrder] });
    mockScanBoxRejection(workOrder, 'box_code', 'Box not found');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /^scan$|^مسح$/i }));
    await scanBox(user, 'BX-DOES-NOT-EXIST');

    expect(
      await screen.findByText(/no box found with this code|لم يتم العثور على صندوق بهذا الرمز/i),
    ).toBeInTheDocument();
  });
});
