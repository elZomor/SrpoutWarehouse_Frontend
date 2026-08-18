import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkOrder } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import { colors } from '../theme/tokens';
import '../i18n';
import {
  clickRowAction,
  fillExpectedDateOut,
  makeActiveWorkOrder,
  makeProductType,
  makeWorkOrder,
  mockListEndpoints,
  renderWorkOrdersPage,
  selectProductTypeForLineItem,
} from './workOrdersTestSupport';

// Split out of WorkOrdersPage.test.tsx (WRH-34) - see workOrdersTestSupport's
// header comment. WRH-75 merged the old Active/Manage tabs into one table -
// this file now covers the actions that used to live only on the Active
// tab: Add Supplementary, packing-list download, and the view-details
// drill-in. Every row this file exercises needs a matching entry in both
// `workOrders` (the table's data source) and `activeWorkOrders` (the
// per-line-item returned/damaged/still-out + Primary-id lookup - see
// WorkOrdersPage's activeLineItemsById comment), same id/status on both.

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

describe('WorkOrdersPage - active-derived actions', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders every work order in one list regardless of status', async () => {
    // TC-01/TC-02/AC-2: WRH-75 - no more Active/Manage split, one row per WO.
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [
        makeWorkOrder({ id: 1, reference: 'WO-1', job_name: 'Summer Gala', status: 'fulfilled' }),
        makeWorkOrder({
          id: 2,
          reference: 'WO-2',
          job_name: 'Winter Ball',
          client_name: 'Frost Co',
          expected_date_out: '2026-09-01',
          status: 'draft',
        }),
      ],
      activeWorkOrders: [makeActiveWorkOrder({ id: 1, reference: 'WO-1' })],
    });

    await renderWorkOrdersPage();

    expect(await screen.findByText('Summer Gala')).toBeInTheDocument();
    expect(screen.getByText('Winter Ball')).toBeInTheDocument();
    expect(screen.getByText('Acme Events')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.getByText(/^fulfilled$|^تم التنفيذ$/i)).toBeInTheDocument();
    expect(screen.getByText(/^draft$|^مسودة$/i)).toBeInTheDocument();
  });

  it('shows an empty state when no work orders exist', async () => {
    // TC-01/AC-4
    mockListEndpoints(mockedApiClient.get, {});

    await renderWorkOrdersPage();

    expect(await screen.findByText(/no work orders found|لا توجد أوامر عمل/i)).toBeInTheDocument();
  });

  it('creates a supplementary WO linked to the chosen Primary', async () => {
    // TC-01/AC-1: the create modal opened via a Primary row's "Add
    // Supplementary" kebab action posts parent_work_order, and titles
    // itself with the Primary's own reference.
    const primary = makeActiveWorkOrder({ reference: 'WO-1' });
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ reference: 'WO-1', status: 'fulfilled' })],
      activeWorkOrders: [primary],
    });
    mockedApiClient.post.mockResolvedValueOnce({
      data: makeWorkOrder({ id: 2, reference: 'WO-1-S1', job_name: 'Extra Lighting' }),
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();
    await screen.findByText('Summer Gala');

    await clickRowAction(user, 'WO-1', /add supplementary|إضافة أمر تكميلي/i);
    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('WO-1');

    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Extra Lighting');
    await fillExpectedDateOut(user, '2026-08-02');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '3');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/', {
      job_name: 'Extra Lighting',
      client_name: '',
      expected_date_out: '2026-08-02',
      line_items: [{ product_type: 1, quantity: 3 }],
      parent_work_order: 1,
    });
  });

  it('does not send parent_work_order when creating a plain Primary WO', async () => {
    // Regression: supplementaryParent must reset on close - the "New WO"
    // button must never inherit a stale parent from an earlier, abandoned
    // supplementary-create session.
    const workOrders: WorkOrder[] = [makeWorkOrder({ reference: 'WO-1', status: 'fulfilled' })];
    mockListEndpoints(mockedApiClient.get, {
      workOrders,
      activeWorkOrders: [makeActiveWorkOrder()],
    });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeWorkOrder() });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();
    await screen.findByText('Summer Gala');

    await clickRowAction(user, 'WO-1', /add supplementary|إضافة أمر تكميلي/i);
    await user.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));

    await user.click(
      await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i, hidden: true }),
    );
    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Summer Gala');
    await fillExpectedDateOut(user, '2026-08-01');
    await selectProductTypeForLineItem(user, 0, 'Bar LED Model A');
    await user.type(screen.getByPlaceholderText(/qty|الكمية/i), '5');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/work-orders/', {
      job_name: 'Summer Gala',
      client_name: '',
      expected_date_out: '2026-08-01',
      line_items: [{ product_type: 1, quantity: 5 }],
    });
  });

  it('downloads the packing list PDF when the kebab action is clicked', async () => {
    // AC-1: "Download Packing List" on a Primary WO triggers a browser
    // download of the PDF the backend returns.
    const primary = makeActiveWorkOrder();
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'fulfilled' })],
      activeWorkOrders: [primary],
    });
    const pdfBlob = new Blob(['%PDF-fake'], { type: 'application/pdf' });
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/work-orders/1/packing-list/') {
        return Promise.resolve({ data: pdfBlob });
      }
      if (url === '/api/work-orders/active/') {
        return Promise.resolve({ data: [primary] });
      }
      if (url === '/api/work-orders/') {
        return Promise.resolve({ data: [makeWorkOrder({ status: 'fulfilled' })] });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const user = userEvent.setup();
    await renderWorkOrdersPage();
    await screen.findByText('Summer Gala');

    await clickRowAction(user, 'WO-1', /download packing list|تحميل قائمة التعبئة/i);

    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalledWith(pdfBlob));
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
  }, 45000);

  it('shows a generic error message when the packing list download fails', async () => {
    const primary = makeActiveWorkOrder();
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'fulfilled' })],
      activeWorkOrders: [primary],
    });
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/work-orders/1/packing-list/') {
        return Promise.reject({
          isAxiosError: true,
          response: { status: 400, data: new Blob([]) },
        });
      }
      if (url === '/api/work-orders/active/') {
        return Promise.resolve({ data: [primary] });
      }
      if (url === '/api/work-orders/') {
        return Promise.resolve({ data: [makeWorkOrder({ status: 'fulfilled' })] });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();
    await screen.findByText('Summer Gala');

    await clickRowAction(user, 'WO-1', /download packing list|تحميل قائمة التعبئة/i);

    expect(
      await screen.findByText(/failed to download the packing list|فشل تحميل قائمة التعبئة/i),
    ).toBeInTheDocument();
  });

  it('grays out a terminal work order and hides its mutating actions (WRH-69/WRH-75)', async () => {
    // WRH-69's "closed Primary kept read-only" nuance no longer depends on
    // nesting (WRH-75 dropped it) - any terminal-status row now renders
    // grayed out with only informational (non-mutating) kebab actions,
    // regardless of whether it's a Primary or Supplementary.
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ reference: 'WO-1', status: 'closed' })],
      activeWorkOrders: [],
    });

    await renderWorkOrdersPage();

    const row = (await screen.findByText('Summer Gala')).closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveStyle({
      backgroundColor: colors.surfaceMuted,
      color: colors.textMuted,
    });

    const user = userEvent.setup();
    await user.click(within(row as HTMLElement).getByRole('button', { hidden: true }));

    expect(
      screen.queryByRole('menuitem', { name: /add supplementary|إضافة أمر تكميلي/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^return$|^إرجاع$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^transfer$|^نقل$/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /close work order|إغلاق أمر العمل/i }),
    ).not.toBeInTheDocument();
    // Still present: informational/non-mutating actions.
    expect(
      screen.getByRole('menuitem', { name: /view details|عرض التفاصيل/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /download packing list|تحميل قائمة التعبئة/i }),
    ).toBeInTheDocument();
  });

  it('drills into a work order to show exact serials and their statuses', async () => {
    // TC-03/AC-3
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'fulfilled' })],
      activeWorkOrders: [makeActiveWorkOrder()],
    });
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/work-orders/active/') {
        return Promise.resolve({ data: [makeActiveWorkOrder()] });
      }
      if (url === '/api/work-orders/') {
        return Promise.resolve({ data: [makeWorkOrder({ status: 'fulfilled' })] });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      if (url === '/api/work-orders/1/') {
        return Promise.resolve({
          data: {
            id: 1,
            reference: 'WO-1',
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

    const user = userEvent.setup();
    await renderWorkOrdersPage();
    await screen.findByText('Summer Gala');

    await clickRowAction(user, 'WO-1', /view details|عرض التفاصيل/i);

    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText('SN-0001')).toBeInTheDocument();
    expect(within(dialog).getByText(/^out$|^خارج$/i)).toBeInTheDocument();
  }, 45000);

  it('opens the exact work order detail view when navigated to its URL directly (WRH-70/AC-2)', async () => {
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/work-orders/active/') {
        return Promise.resolve({ data: [makeActiveWorkOrder()] });
      }
      if (url === '/api/work-orders/') {
        return Promise.resolve({ data: [makeWorkOrder({ status: 'fulfilled' })] });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      if (url === '/api/work-orders/1/') {
        return Promise.resolve({
          data: {
            id: 1,
            reference: 'WO-1',
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

    await renderWorkOrdersPage({ initialEntries: ['/work-orders/1'] });

    await screen.findByRole('dialog', { hidden: true });
    expect(await screen.findByText('SN-0001')).toBeInTheDocument();
  }, 45000);

  it('bounces a non-numeric :id back to the work orders list (WRH-70)', async () => {
    mockListEndpoints(mockedApiClient.get, {
      workOrders: [makeWorkOrder({ status: 'fulfilled' })],
      activeWorkOrders: [makeActiveWorkOrder()],
    });

    await renderWorkOrdersPage({ initialEntries: ['/work-orders/not-a-number'] });

    await screen.findByText('Summer Gala');
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
  });

  it('bounces a numeric but nonexistent :id back to the work orders list (WRH-70)', async () => {
    // A syntactically valid id that 404s (stale bookmark, deleted WO)
    // shouldn't leave the modal stuck open on just the error alert.
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/work-orders/active/') {
        return Promise.resolve({ data: [makeActiveWorkOrder()] });
      }
      if (url === '/api/work-orders/') {
        return Promise.resolve({ data: [makeWorkOrder({ status: 'fulfilled' })] });
      }
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      if (url === '/api/work-orders/999/') {
        return Promise.reject({ isAxiosError: true, response: { status: 404, data: {} } });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    await renderWorkOrdersPage({ initialEntries: ['/work-orders/999'] });

    await screen.findByText('Summer Gala');
    // AntD keeps a closed Modal mounted (display: none) for its exit
    // animation rather than unmounting it, so assert non-hidden absence
    // (the open state) rather than querying with hidden: true.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
