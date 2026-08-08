import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActiveWorkOrder } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';
import {
  makeActiveWorkOrder,
  mockListEndpoints,
  renderWorkOrdersPage,
} from './workOrdersTestSupport';

// WRH-40 (US-019a) - covers the Active tab's "Close Work Order" action:
// AC-1/AC-2 (warning + confirm sweeps remaining items to Missing), AC-4
// (zero-out closes cleanly with no warning). Mirrors
// WorkOrdersPage.return.test.tsx's file-per-feature split and mock shape.

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

async function closeWorkOrder(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole('button', { name: /close work order|إغلاق أمر العمل/i });
  await user.click(button);
  await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i }));
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
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
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
    await renderWorkOrdersPage({ tab: 'active' });
    const button = await screen.findByRole('button', {
      name: /close work order|إغلاق أمر العمل/i,
    });
    await user.click(button);

    // Arabic count=3 selects the CLDR "few" plural form (different noun
    // agreement than "other"), so this matches loosely on the number +
    // the shared "still out" phrase rather than one exact full sentence.
    expect(await screen.findByText(/3.*(still out|بالخارج)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^ok$|^موافق$/i }));

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
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
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
    await renderWorkOrdersPage({ tab: 'active' });
    const button = await screen.findByRole('button', {
      name: /close work order|إغلاق أمر العمل/i,
    });
    await user.click(button);

    expect(
      await screen.findByText(/close this work order\?|إغلاق أمر العمل هذا؟/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/still out|لا يزال بالخارج/i)).not.toBeInTheDocument();
  });

  it('invalidates and refetches the Active tab after closing', async () => {
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
        return Promise.resolve({ data: [] });
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
    await renderWorkOrdersPage({ tab: 'active' });
    const countBeforeClose = getCallCount;
    await closeWorkOrder(user);

    await waitFor(() => expect(getCallCount).toBeGreaterThan(countBeforeClose));
  });

  it('shows a generic error when closing fails', async () => {
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
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
    await renderWorkOrdersPage({ tab: 'active' });
    await closeWorkOrder(user);

    expect(
      await screen.findByText(/failed to close this work order|فشل إغلاق أمر العمل هذا/i),
    ).toBeInTheDocument();
  });
});
