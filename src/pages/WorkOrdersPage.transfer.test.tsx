import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActiveWorkOrder, WorkOrder } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';
import {
  makeActiveWorkOrder,
  makeProductType,
  makeWorkOrder,
  mockListEndpoints,
  renderWorkOrdersPage,
} from './workOrdersTestSupport';

// Split out to its own file matching WorkOrdersPage.return.test.tsx's
// precedent (see workOrdersTestSupport's header comment / LESSONS.md's
// WRH-55 entry) - this file covers WRH-36's Active-tab transfer flow.

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function mockTransferItem(workOrder: ActiveWorkOrder, response: unknown) {
  mockedApiClient.post.mockImplementation((url: string) => {
    if (url === `/api/work-orders/${workOrder.id}/transfer/`) {
      return Promise.resolve({ data: response });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

function mockTransferItemRejection(workOrder: ActiveWorkOrder, field: string, message: string) {
  mockedApiClient.post.mockImplementation((url: string) => {
    if (url === `/api/work-orders/${workOrder.id}/transfer/`) {
      return Promise.reject({
        isAxiosError: true,
        response: { status: 400, data: { [field]: [message] } },
      });
    }
    return Promise.reject(new Error(`Unexpected POST ${url}`));
  });
}

async function openTransferModal(user: ReturnType<typeof userEvent.setup>) {
  // hidden: true - see hiddenTrueForRoleQueries.md: skips testing-library's
  // default accessibility-tree visibility check (the actual slow part is
  // jsdom resolving antd's CSS var() chains per candidate). Scoped to a
  // single active-tab row's "Transfer" action button here, so there's no
  // Manage/Active-pane duplicate to collide with.
  const button = await screen.findByRole('button', { name: /^transfer$|^نقل$/i, hidden: true });
  await user.click(button);
}

// WRH-68: destination_line_item is now a second, dependent Select - always
// rendered (disabled until a destination WO is picked), so there are two
// comboboxes in the dialog from the start. Selected by index, matching
// WorkOrdersPage.create.test.tsx's selectProductTypeForLineItem precedent,
// rather than by role alone (which would now match more than one element).
async function submitTransfer(
  user: ReturnType<typeof userEvent.setup>,
  serialNumber: string,
  destinationLabel: string,
  destinationLineItemLabel = 'Bar LED Model A',
) {
  const dialog = screen.getByRole('dialog', { hidden: true });
  const serialInput = within(dialog).getByLabelText(/serial number|الرقم التسلسلي/i);
  await user.clear(serialInput);
  await user.type(serialInput, serialNumber);

  const destinationCombobox = within(dialog).getAllByRole('combobox', { hidden: true })[0];
  if (!destinationCombobox) {
    throw new Error('No destination work order combobox found');
  }
  await user.click(destinationCombobox);
  const destinationOption = screen.getAllByTitle(destinationLabel).at(-1);
  if (!destinationOption) {
    throw new Error(`No destination option found for ${destinationLabel}`);
  }
  await user.click(destinationOption);

  const lineItemCombobox = within(dialog).getAllByRole('combobox', { hidden: true })[1];
  if (!lineItemCombobox) {
    throw new Error('No destination line item combobox found');
  }
  await user.click(lineItemCombobox);
  const lineItemOption = screen.getAllByTitle(destinationLineItemLabel).at(-1);
  if (!lineItemOption) {
    throw new Error(`No destination line item option found for ${destinationLineItemLabel}`);
  }
  await user.click(lineItemOption);

  await user.click(within(dialog).getByRole('button', { name: /^transfer$|^نقل$/i, hidden: true }));
}

describe('WorkOrdersPage - transfer', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('transfers an item to another work order and shows the success message', async () => {
    // AC-1/TC-01
    const sourceWorkOrder = makeActiveWorkOrder({ id: 1, reference: 'WO-1', status: 'fulfilled' });
    const destinationWorkOrder: WorkOrder = makeWorkOrder({
      id: 2,
      reference: 'WO-2',
      job_name: 'Winter Expo',
    });
    mockListEndpoints(mockedApiClient.get, {
      activeWorkOrders: [sourceWorkOrder],
      workOrders: [makeWorkOrder({ id: 1, reference: 'WO-1' }), destinationWorkOrder],
    });
    mockTransferItem(sourceWorkOrder, {
      serial_number: 'SN-042',
      status: 'out',
      source_work_order: 'WO-1',
      destination_work_order: 'WO-2',
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openTransferModal(user);
    await submitTransfer(user, 'SN-042', 'WO-2 — Winter Expo');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/1/transfer/', {
      serial_number: 'SN-042',
      destination_work_order: 2,
      destination_line_item: 1,
    });
    expect(
      await screen.findByText(/SN-042 transferred to WO-2|تم نقل SN-042 إلى WO-2/i),
    ).toBeInTheDocument();
  });

  it('excludes the source work order from the destination options', async () => {
    // AC-2: any *other* WO, Primary or Supplementary, is a valid destination.
    const sourceWorkOrder = makeActiveWorkOrder({ id: 1, reference: 'WO-1', status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, {
      activeWorkOrders: [sourceWorkOrder],
      workOrders: [
        makeWorkOrder({ id: 1, reference: 'WO-1' }),
        makeWorkOrder({ id: 3, reference: 'WO-1-S1', job_name: 'Winter Expo (Supp)' }),
      ],
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openTransferModal(user);
    const dialog = screen.getByRole('dialog', { hidden: true });
    const destinationCombobox = within(dialog).getAllByRole('combobox', { hidden: true })[0];
    if (!destinationCombobox) {
      throw new Error('No destination work order combobox found');
    }
    await user.click(destinationCombobox);

    expect(screen.queryByTitle(/^WO-1 —/)).not.toBeInTheDocument();
    expect(screen.getAllByTitle(/^WO-1-S1 —/).length).toBeGreaterThan(0);
  });

  it('WRH-68: disables the destination line item select until a destination WO is chosen, then scopes options to it', async () => {
    const sourceWorkOrder = makeActiveWorkOrder({ id: 1, reference: 'WO-1', status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, {
      activeWorkOrders: [sourceWorkOrder],
      workOrders: [
        makeWorkOrder({
          id: 2,
          reference: 'WO-2',
          line_items: [
            {
              id: 5,
              product_type: 1,
              product_type_name: 'Bar LED Model A',
              quantity: 3,
              scanned_quantity: 0,
              remaining_quantity: 3,
            },
          ],
        }),
      ],
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openTransferModal(user);
    const dialog = screen.getByRole('dialog', { hidden: true });
    const [destinationCombobox, lineItemCombobox] = within(dialog).getAllByRole('combobox', {
      hidden: true,
    });
    if (!destinationCombobox || !lineItemCombobox) {
      throw new Error('Expected two comboboxes in the transfer dialog');
    }

    expect(lineItemCombobox).toBeDisabled();

    await user.click(destinationCombobox);
    const destinationOption = screen.getAllByTitle('WO-2 — Summer Gala').at(-1);
    if (!destinationOption) {
      throw new Error('No destination option found for WO-2 — Summer Gala');
    }
    await user.click(destinationOption);

    expect(lineItemCombobox).not.toBeDisabled();
    await user.click(lineItemCombobox);
    expect(screen.getAllByTitle('Bar LED Model A').length).toBeGreaterThan(0);
  });

  it('names the other work order when a transferred serial is not currently out on this one', async () => {
    const sourceWorkOrder = makeActiveWorkOrder({ id: 1, reference: 'WO-1', status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, {
      activeWorkOrders: [sourceWorkOrder],
      workOrders: [makeWorkOrder({ id: 2, reference: 'WO-2' })],
    });
    mockTransferItemRejection(
      sourceWorkOrder,
      'serial_number',
      'SN-042 is not currently out on WO-17',
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openTransferModal(user);
    await submitTransfer(user, 'SN-042', 'WO-2 — Summer Gala');

    expect(await screen.findByText(/WO-17/)).toBeInTheDocument();
  });

  it('WRH-68: surfaces a quantity-cap rejection on the destination line item', async () => {
    const sourceWorkOrder = makeActiveWorkOrder({ id: 1, reference: 'WO-1', status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, {
      activeWorkOrders: [sourceWorkOrder],
      workOrders: [makeWorkOrder({ id: 2, reference: 'WO-2' })],
    });
    mockTransferItemRejection(
      sourceWorkOrder,
      'destination_line_item',
      'This line item has already reached its requested quantity.',
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openTransferModal(user);
    await submitTransfer(user, 'SN-042', 'WO-2 — Summer Gala');

    expect(
      await screen.findByText(/already reached its requested quantity|وصل.*الكمية المطلوبة/i),
    ).toBeInTheDocument();
  });

  it('does not reopen the Transfer modal if its response lands after the modal was closed', async () => {
    // Regression: mirrors the equivalent return-modal test - a response
    // landing after close must not surface into a dismissed modal.
    const sourceWorkOrder = makeActiveWorkOrder({ id: 1, reference: 'WO-1', status: 'fulfilled' });
    mockListEndpoints(mockedApiClient.get, {
      activeWorkOrders: [sourceWorkOrder],
      workOrders: [makeWorkOrder({ id: 2, reference: 'WO-2' })],
    });
    let resolvePost: ((value: { data: unknown }) => void) | undefined;
    mockedApiClient.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openTransferModal(user);
    await submitTransfer(user, 'SN-9001', 'WO-2 — Summer Gala');

    await user.click(screen.getByRole('button', { name: /^done$|^تم$/i, hidden: true }));

    await act(async () => {
      resolvePost?.({
        data: {
          serial_number: 'SN-9001',
          status: 'out',
          source_work_order: 'WO-1',
          destination_work_order: 'WO-2',
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.queryByText(/SN-9001 transferred to WO-2|تم نقل SN-9001 إلى WO-2/i),
    ).not.toBeInTheDocument();
  });

  it('invalidates nothing but keeps the session open for a second transfer', async () => {
    // AC-1: a manager can transfer several items from the same source WO in
    // one sitting - the form resets and stays open after a successful
    // transfer rather than closing.
    const sourceWorkOrder = makeActiveWorkOrder({ id: 1, reference: 'WO-1', status: 'fulfilled' });
    let getCallCount = 0;
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      if (url === '/api/work-orders/active/') {
        getCallCount += 1;
        return Promise.resolve({ data: [sourceWorkOrder] });
      }
      if (url === '/api/work-orders/') {
        return Promise.resolve({ data: [makeWorkOrder({ id: 2, reference: 'WO-2' })] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    mockTransferItem(sourceWorkOrder, {
      serial_number: 'SN-042',
      status: 'out',
      source_work_order: 'WO-1',
      destination_work_order: 'WO-2',
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await openTransferModal(user);
    const callsBeforeSubmit = getCallCount;
    await submitTransfer(user, 'SN-042', 'WO-2 — Summer Gala');
    await screen.findByText(/SN-042 transferred to WO-2|تم نقل SN-042 إلى WO-2/i);

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(within(dialog).getByLabelText(/serial number|الرقم التسلسلي/i)).toHaveValue('');
    await waitFor(() => expect(getCallCount).toBe(callsBeforeSubmit));
  });
});
