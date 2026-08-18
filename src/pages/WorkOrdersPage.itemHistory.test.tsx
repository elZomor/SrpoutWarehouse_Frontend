import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../features/transactions/types';
import type { WorkOrder, WorkOrderDetail } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';
import {
  clickRowAction,
  makeProductType,
  makeWorkOrder,
  renderWorkOrdersPage,
} from './workOrdersTestSupport';

// WRH-79: covers the WO detail view's own item rows opening the shared
// ItemHistoryModal - split out (matching this file group's own precedent,
// see workOrdersTestSupport's header comment) rather than added to an
// existing flow file, since no existing file exercises the "View Details"
// detail modal at all.

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeWorkOrderDetail(overrides: Partial<WorkOrderDetail> = {}): WorkOrderDetail {
  return {
    id: 1,
    reference: 'WO-1',
    job_name: 'Summer Gala',
    client_name: 'Acme Events',
    expected_date_out: '2026-08-01',
    status: 'in_progress',
    created_by: 1,
    created_by_username: 'jane',
    parent_work_order: null,
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        quantity: 1,
        serialized_items: [{ id: 1, serial_number: 'SN-042', status: 'out' }],
      },
    ],
    ...overrides,
  };
}

function mockListEndpointsWithDetailAndHistory({
  workOrders,
  workOrderDetail,
  transactions = [],
}: {
  workOrders: WorkOrder[];
  workOrderDetail: WorkOrderDetail;
  transactions?: Transaction[];
}) {
  mockedApiClient.get.mockImplementation((url: string) => {
    if (url === '/api/product-types/') {
      return Promise.resolve({ data: [makeProductType()] });
    }
    if (url === '/api/work-orders/active/') {
      return Promise.resolve({ data: [] });
    }
    if (url === '/api/work-orders/') {
      return Promise.resolve({ data: workOrders });
    }
    if (url === `/api/work-orders/${workOrderDetail.id}/`) {
      return Promise.resolve({ data: workOrderDetail });
    }
    if (url === '/api/transactions/') {
      return Promise.resolve({ data: transactions });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

describe('WorkOrdersPage item history', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('opens the shared item history card when a WO detail item row is clicked', async () => {
    // WRH-79/AC-1/AC-2/AC-6
    const workOrder = makeWorkOrder();
    mockListEndpointsWithDetailAndHistory({
      workOrders: [workOrder],
      workOrderDetail: makeWorkOrderDetail(),
      transactions: [
        {
          id: 1,
          transaction_type: 'issue',
          transaction_type_display: 'Issue',
          reference_number: 'WO-1',
          serial_number: 'SN-042',
          product_type_name: 'Bar LED Model A',
          created_at: '2026-08-01T10:00:00Z',
          user_username: 'jane',
          note: '',
        },
      ],
    });

    const user = userEvent.setup();
    await renderWorkOrdersPage();

    await clickRowAction(user, 'WO-1', /view details|عرض التفاصيل/i);
    const detailDialog = await screen.findByRole('dialog', { hidden: true });
    await user.click(await within(detailDialog).findByText('SN-042'));

    const dialogs = await screen.findAllByRole('dialog', { hidden: true });
    const historyDialog = dialogs[dialogs.length - 1] as HTMLElement;
    expect(within(historyDialog).getByText('Bar LED Model A — SN-042')).toBeInTheDocument();
    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/transactions/', {
      params: { serial_number: 'SN-042' },
    });

    const footer = historyDialog.querySelector('.ant-modal-footer') as HTMLElement;
    await user.click(within(footer).getByRole('button', { hidden: true }));
    await waitFor(() => {
      expect(screen.getAllByRole('dialog').length).toBe(1);
    });
    // Original WO detail dialog is still open, list state preserved (AC-5).
    expect(within(detailDialog).getByText('SN-042')).toBeInTheDocument();
  });
});
