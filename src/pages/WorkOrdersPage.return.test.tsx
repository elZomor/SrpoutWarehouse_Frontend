import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActiveWorkOrder } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';
import {
  makeActiveWorkOrder,
  makeProductType,
  mockListEndpoints,
  renderWorkOrdersPage,
} from './workOrdersTestSupport';

// Split out of WorkOrdersPage.test.tsx (WRH-34) - see workOrdersTestSupport's
// header comment. This file covers the Active tab's return/mark-damaged
// flow (WRH-38/WRH-57) - per LESSONS.md's WRH-55 entry, opening this Modal
// was reliably one of the heavier render paths in the original combined
// file under `--coverage`.

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

// WRH-38: mocks return_item() only - mockListEndpoints still supplies the
// active-list GET, matching mockScanRejection's precedent of a
// POST-only mock layered on top of it.
function mockReturnItem(workOrder: ActiveWorkOrder, response: unknown) {
  mockedApiClient.post.mockImplementation((url: string) => {
    if (url === `/api/work-orders/${workOrder.id}/return-item/`) {
      return Promise.resolve({ data: response });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

function mockReturnItemRejection(workOrder: ActiveWorkOrder, field: string, message: string) {
  mockedApiClient.post.mockImplementation((url: string) => {
    if (url === `/api/work-orders/${workOrder.id}/return-item/`) {
      return Promise.reject({
        isAxiosError: true,
        response: { status: 400, data: { [field]: [message] } },
      });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

async function openReturnModal(user: ReturnType<typeof userEvent.setup>) {
  // Queries the button directly (scoped to the whole document, not via
  // getByRole('row', {name}) + within(row)) - only one work order exists
  // in these tests, so there's no ambiguity, and a row's accessible name
  // aggregates every cell's content including each contained button's
  // own name. That computation is disproportionately expensive once a
  // row has two interactive descendants (View Details + Return) instead
  // of one - regression: this exact row+within pattern reliably pushed
  // this test past even a 60s per-test override under `--coverage`,
  // where the equivalent direct button query finishes in ~1s.
  const button = await screen.findByRole('button', { name: /^return$|^إرجاع$/i });
  await user.click(button);
}

async function returnSerial(user: ReturnType<typeof userEvent.setup>, serialNumber: string) {
  const dialog = screen.getByRole('dialog');
  const input = screen.getByLabelText(/serial number|الرقم التسلسلي/i);
  await user.clear(input);
  await user.type(input, serialNumber);
  await user.click(within(dialog).getByRole('button', { name: /^return$|^إرجاع$/i }));
}

async function markSerialDamaged(user: ReturnType<typeof userEvent.setup>, serialNumber: string) {
  const dialog = screen.getByRole('dialog');
  const input = screen.getByLabelText(/serial number|الرقم التسلسلي/i);
  await user.clear(input);
  await user.type(input, serialNumber);
  await user.click(
    within(dialog).getByRole('button', { name: /mark as damaged|وضع علامة كتالف/i }),
  );
}

// WRH-26/AC-2/AC-3: return-box() only - matches mockReturnItem's identical
// POST-only-mock precedent.
function mockReturnBox(workOrder: ActiveWorkOrder, response: unknown) {
  mockedApiClient.post.mockImplementation((url: string) => {
    if (url === `/api/work-orders/${workOrder.id}/return-box/`) {
      return Promise.resolve({ data: response });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

async function returnBox(user: ReturnType<typeof userEvent.setup>, boxCode: string) {
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).getByLabelText(/box code|رمز الصندوق/i);
  await user.clear(input);
  await user.type(input, boxCode);
  await user.click(within(dialog).getByRole('button', { name: /^return box$|^إرجاع صندوق$/i }));
}

describe('WorkOrdersPage - return', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  // Timeout bumped - opening the Return modal is reliably one of the
  // heavier render paths here, measured ~24s in isolation even after
  // splitting this file out of the original WorkOrdersPage.test.tsx
  // (WRH-34), with no coverage instrumentation involved. Real per-test
  // render cost, not a file-size or coverage artifact.
  it('shows a Return button for a fulfilled WO and records a partial return', async () => {
    // AC-2/TC-02
    const workOrder = makeActiveWorkOrder({
      status: 'fulfilled',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 2,
          returned_quantity: 0,
          damaged_quantity: 0,
          still_out_quantity: 2,
        },
      ],
    });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
    mockReturnItem(workOrder, {
      id: 1,
      job_name: 'Summer Gala',
      status: 'partially_returned',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 2,
          returned_quantity: 1,
          damaged_quantity: 0,
          still_out_quantity: 1,
        },
      ],
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openReturnModal(user);
    await returnSerial(user, 'SN-1001');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/1/return-item/', {
      serial_number: 'SN-1001',
    });
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(/^partially returned$|^إرجاع جزئي$/i),
    ).toBeInTheDocument();
    const row = await within(dialog).findByRole('row', { name: /bar led model a/i });
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Bar LED Model A', '2', '1', '0', '1']); // issued, returned, damaged, still out
  }, 40000);

  it('marks a scanned unit as damaged instead of returning it, and reflects it as its own category', async () => {
    // WRH-57/AC-1/AC-2/AC-3/TC-01/TC-03
    const workOrder = makeActiveWorkOrder({
      status: 'fulfilled',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 2,
          returned_quantity: 1,
          damaged_quantity: 0,
          still_out_quantity: 1,
        },
      ],
    });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
    mockReturnItem(workOrder, {
      id: 1,
      job_name: 'Summer Gala',
      status: 'returned',
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          quantity: 2,
          returned_quantity: 1,
          damaged_quantity: 1,
          still_out_quantity: 0,
        },
      ],
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openReturnModal(user);
    await markSerialDamaged(user, 'SN-9001');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/1/return-item/', {
      serial_number: 'SN-9001',
      damaged: true,
    });
    const dialog = await screen.findByRole('dialog');
    // AC-3: a WO with a damaged item still reaches "returned" once every
    // other item is accounted for.
    expect(await within(dialog).findByText(/^returned$|^تم الإرجاع$/i)).toBeInTheDocument();
    const row = await within(dialog).findByRole('row', { name: /bar led model a/i });
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Bar LED Model A', '2', '1', '1', '0']); // issued, returned, damaged, still out
  });

  // "shows a Return button for a partially_returned WO" / "does not show a
  // Return button for a draft or in_progress WO" moved to
  // src/features/work-orders/logic.test.ts (isReturnEligible) - the
  // button's positive-case rendering is still proven above ("shows a
  // Return button for a fulfilled WO..."), so no mount coverage is lost.

  // "shows 'serial not found' for an unregistered serial during return"
  // moved to logic.test.ts. Kept below as the one classifier-covered
  // return test that still exercises the flow end-to-end (see logic.ts's
  // header comment).
  it('names the other work order when a returned serial was not issued on this one', async () => {
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
    mockReturnItemRejection(workOrder, 'serial_number', 'SN-042 was not issued on WO-17');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openReturnModal(user);
    await returnSerial(user, 'SN-042');

    expect(await screen.findByText(/WO-17/)).toBeInTheDocument();
  });

  // "rejects an item that is not currently out during return" moved to
  // logic.test.ts.

  it('invalidates and refetches the Active tab after closing a return session', async () => {
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    let getCallCount = 0;
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
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
    mockReturnItem(workOrder, { ...workOrder, status: 'partially_returned' });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openReturnModal(user);
    await returnSerial(user, 'SN-3001');
    await screen.findByText(/^partially returned$|^إرجاع جزئي$/i);
    const countBeforeClose = getCallCount;

    await user.click(screen.getByRole('button', { name: /^done$|^تم$/i }));

    await waitFor(() => expect(getCallCount).toBeGreaterThan(countBeforeClose));
  });

  it('does not reopen the Return modal if its response lands after the modal was closed', async () => {
    // Regression: onReturnSubmit's onSuccess used to call setReturnSession
    // unconditionally - a response that lands after the modal was already
    // dismissed would reopen it with stale data.
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
    let resolvePost: ((value: { data: unknown }) => void) | undefined;
    mockedApiClient.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openReturnModal(user);
    await returnSerial(user, 'SN-9001');

    await user.click(screen.getByRole('button', { name: /^done$|^تم$/i }));

    await act(async () => {
      resolvePost?.({ data: { ...workOrder, status: 'partially_returned' } });
      await Promise.resolve();
      await Promise.resolve();
    });

    // AntD's Modal never truly unmounts in jsdom (rc-motion's "leave"
    // transition classes linger forever since jsdom never fires
    // transitionend), so asserting the dialog node itself is gone isn't a
    // reliable signal here - checking that the stale response's content
    // never rendered is the direct test of the actual regression (the old
    // bug would show this text by calling setReturnSession(updated)
    // unconditionally in onSuccess).
    expect(screen.queryByText(/^partially returned$|^إرجاع جزئي$/i)).not.toBeInTheDocument();
  });

  // Timeout bumped for the same reason as "shows a Return button for a
  // fulfilled WO..." above - measured ~29s in isolation, no coverage
  // involved.
  it('does not apply a stale response after closing and reopening the same WO', async () => {
    // Regression: a workOrderId-only staleness check can't tell a closed-
    // then-reopened session for the SAME WO apart from the original one -
    // this response belongs to the abandoned first session and must not
    // overwrite the freshly reopened one, even though the id matches.
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
    let resolvePost: ((value: { data: unknown }) => void) | undefined;
    mockedApiClient.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openReturnModal(user);
    await returnSerial(user, 'SN-8001');

    await user.click(screen.getByRole('button', { name: /^done$|^تم$/i }));
    await openReturnModal(user);

    await act(async () => {
      resolvePost?.({ data: { ...workOrder, status: 'partially_returned' } });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The reopened session must keep showing its own (fulfilled) status,
    // not get silently overwritten by the abandoned first session's
    // stale "partially_returned" response.
    expect(screen.queryByText(/^partially returned$|^إرجاع جزئي$/i)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog').textContent).toMatch(/fulfilled|تم التنفيذ/i);
  }, 90000);

  it('returns a box and marks the WO returned once every item is back', async () => {
    // WRH-26/AC-2/AC-3
    const workOrder = makeActiveWorkOrder({ status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [workOrder] });
    mockReturnBox(workOrder, {
      work_order: {
        id: workOrder.id,
        job_name: workOrder.job_name,
        status: 'returned',
        line_items: [
          {
            ...workOrder.line_items[0],
            returned_quantity: 5,
            damaged_quantity: 0,
            still_out_quantity: 0,
          },
        ],
      },
      box_summary: {
        code: 'BX-003',
        added: 5,
        results: [
          { serial_number: 'SN-3001', added: true, reason: '' },
          { serial_number: 'SN-3002', added: true, reason: '' },
        ],
      },
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openReturnModal(user);
    await returnBox(user, 'BX-003');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/1/return-box/', {
      box_code: 'BX-003',
    });
    expect(
      await screen.findByText(/box bx-003 expanded: 5 items added|تم توسيع الصندوق bx-003/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/^returned$|^تم الإرجاع$/i)).toBeInTheDocument();
  }, 40000);
});
