import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActiveWorkOrder } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';
import {
  clickRowAction,
  makeActiveWorkOrder,
  makeWorkOrder,
  mockListEndpoints,
  openRowActionMenu,
  renderWorkOrdersPage,
} from './workOrdersTestSupport';

// WRH-40 (US-019a) - covers the merged screen's "Close Work Order" kebab
// action: AC-1/AC-2 (warning + confirm sweeps remaining items to Missing),
// AC-4 (zero-out closes cleanly with no warning). Mirrors
// WorkOrdersPage.return.test.tsx's file-per-feature split and mock shape.
// WRH-75: every case here needs a matching `workOrders` entry alongside its
// `activeWorkOrders` one - see WorkOrdersPage.active.test.tsx's header.

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function mockCloseWorkOrder(workOrder: ActiveWorkOrder, response: unknown) {
  mockedApiClient.post.mockImplementation((url: string) => {
    if (url === `/api/work-orders/${workOrder.id}/close/`) {
      return Promise.resolve({ data: response });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

async function closeWorkOrder(user: ReturnType<typeof userEvent.setup>, reference = 'WO-1') {
  await clickRowAction(user, reference, /close work order|إغلاق أمر العمل/i);
  await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));
}

describe('WorkOrdersPage - close', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('warns with the still-out count and closes the WO once confirmed', async () => {
    // AC-1/AC-2/TC-01/TC-02
    const workOrder = makeActiveWorkOrder({
      status: 'fulfilled',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 5,
          returned_quantity: 2,
          damaged_quantity: 0,
          still_out_quantity: 3,
        },
      ],
    });
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'fulfilled' })],
      activeWorkOrders: [workOrder],
    });
    mockCloseWorkOrder(workOrder, {
      work_order: {
        id: workOrder.id,
        job_name: workOrder.job_name,
        status: 'closed',
        line_items: [],
      },
      missing_count: 3,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();
    await screen.findByText(workOrder.job_name);
    await clickRowAction(user, 'WO-1', /close work order|إغلاق أمر العمل/i);

    // Arabic count=3 selects the CLDR "few" plural form (different noun
    // agreement than "other"), so this matches loosely on the number +
    // the shared "still out" phrase rather than one exact full sentence.
    expect(await screen.findByText(/3.*(still out|بالخارج)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^ok$|^موافق$/i, hidden: true }));

    await waitFor(() =>
      expect(mockedApiClient.post).toHaveBeenCalledWith(`/api/work-orders/${workOrder.id}/close/`),
    );
  });

  it('shows a plain confirmation with no warning when nothing is still out', async () => {
    // AC-4/TC-05
    const workOrder = makeActiveWorkOrder({
      status: 'fulfilled',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 5,
          returned_quantity: 5,
          damaged_quantity: 0,
          still_out_quantity: 0,
        },
      ],
    });
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'fulfilled' })],
      activeWorkOrders: [workOrder],
    });
    mockCloseWorkOrder(workOrder, {
      work_order: {
        id: workOrder.id,
        job_name: workOrder.job_name,
        status: 'closed',
        line_items: [],
      },
      missing_count: 0,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();
    await screen.findByText(workOrder.job_name);
    await clickRowAction(user, 'WO-1', /close work order|إغلاق أمر العمل/i);

    expect(
      await screen.findByText(/close this work order\?|إغلاق أمر العمل هذا؟/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/still out|لا يزال بالخارج/i)).not.toBeInTheDocument();
  });

  it('invalidates and refetches the active-work-orders lookup after closing', async () => {
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    let getCallCount = 0;
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/api/work-orders/active/') {
        getCallCount += 1;
        return Promise.resolve({ data: [workOrder] });
      }
      if (url === '/api/work-orders/') {
        return Promise.resolve({ data: [makeWorkOrder({ status: 'fulfilled' })] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    mockCloseWorkOrder(workOrder, {
      work_order: {
        id: workOrder.id,
        job_name: workOrder.job_name,
        status: 'closed',
        line_items: [],
      },
      missing_count: 4,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();
    await screen.findByText(workOrder.job_name);
    const countBeforeClose = getCallCount;
    await closeWorkOrder(user);

    await waitFor(() => expect(getCallCount).toBeGreaterThan(countBeforeClose));
  });

  it('does not show a close action for a draft work order', async () => {
    // WRH-41/AC-1/TC-01
    const workOrder = makeActiveWorkOrder({ status: 'draft' });
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'draft' })],
      activeWorkOrders: [workOrder],
    });

    const user = userEvent.setup();
    await renderWorkOrdersPage();
    await screen.findByText(workOrder.job_name);
    await openRowActionMenu(user, 'WO-1');

    expect(
      screen.queryByRole('menuitem', { name: /close work order|إغلاق أمر العمل/i }),
    ).not.toBeInTheDocument();
  });

  it('does not show a close action for an in_progress work order', async () => {
    // WRH-41/AC-2/TC-02
    const workOrder = makeActiveWorkOrder({ status: 'in_progress' });
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'in_progress' })],
      activeWorkOrders: [workOrder],
    });

    const user = userEvent.setup();
    await renderWorkOrdersPage();
    await screen.findByText(workOrder.job_name);
    await openRowActionMenu(user, 'WO-1');

    expect(
      screen.queryByRole('menuitem', { name: /close work order|إغلاق أمر العمل/i }),
    ).not.toBeInTheDocument();
  });

  // Timeout bump - measures ~500ms without coverage, but specifically under
  // `npm run test:coverage` (v8 instrumentation) this one test measured
  // 30-63s across repeated runs, while every other test in this same file
  // stays under 2s instrumented. Reproducible with just this file/test
  // alone (not cross-file contention) - matches the same
  // coverage-instrumentation-tax category LESSONS.md's WRH-55 entry
  // documents elsewhere in this suite. Not a query-cost or animation-timing
  // issue (both already fixed).
  it('leaves the work order open when the close confirmation is dismissed', async () => {
    // WRH-41/AC-5/TC-05
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'fulfilled' })],
      activeWorkOrders: [workOrder],
    });
    mockCloseWorkOrder(workOrder, {
      work_order: {
        id: workOrder.id,
        job_name: workOrder.job_name,
        status: 'closed',
        line_items: [],
      },
      missing_count: 0,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();
    await screen.findByText(workOrder.job_name);
    await clickRowAction(user, 'WO-1', /close work order|إغلاق أمر العمل/i);
    await screen.findByRole('button', { name: /^ok$|^موافق$/i, hidden: true });

    await user.click(screen.getByRole('button', { name: /^cancel$|^إلغاء$/i, hidden: true }));

    expect(mockedApiClient.post).not.toHaveBeenCalled();
    await openRowActionMenu(user, 'WO-1');
    expect(
      await screen.findByRole('menuitem', { name: /close work order|إغلاق أمر العمل/i }),
    ).toBeInTheDocument();
  }, 90000);

  it('shows a generic error when closing fails', async () => {
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'fulfilled' })],
      activeWorkOrders: [workOrder],
    });
    mockedApiClient.post.mockImplementation((url: string) => {
      if (url === `/api/work-orders/${workOrder.id}/close/`) {
        return Promise.reject({
          isAxiosError: true,
          response: { status: 400, data: { status: ['Work order is not eligible for closing.'] } },
        });
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();
    await screen.findByText(workOrder.job_name);
    await closeWorkOrder(user);

    expect(
      await screen.findByText(/failed to close this work order|فشل إغلاق أمر العمل هذا/i),
    ).toBeInTheDocument();
  });
});
