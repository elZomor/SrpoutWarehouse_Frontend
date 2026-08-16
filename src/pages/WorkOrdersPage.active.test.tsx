import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkOrder } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import { colors } from '../theme/tokens';
import '../i18n';
import {
  fillExpectedDateOut,
  makeActiveWorkOrder,
  makeProductType,
  makeWorkOrder,
  mockListEndpoints,
  renderWorkOrdersPage,
  selectProductTypeForLineItem,
} from './workOrdersTestSupport';

// Split out of WorkOrdersPage.test.tsx (WRH-34) - see workOrdersTestSupport's
// header comment. This file covers the Active tab: the list itself,
// nested supplementaries, the packing-list download, and the view-details
// drill-in.

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

describe('WorkOrdersPage - active tab', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('opens on the Manage tab when navigated with initialTab state (WRH-42)', async () => {
    // MissingItemsPage's WO reference link passes state: { initialTab:
    // 'manage' } since a missing item's WO is always closed and closed WOs
    // are excluded from the Active tab entirely - this proves the tab is
    // selected by that state alone (tab: 'active' below skips the helper's
    // own auto-click, matching a plain link click with no follow-up
    // interaction).
    mockListEndpoints(mockedApiClient.get, { workOrders: [makeWorkOrder({ job_name: 'Job A' })] });

    await renderWorkOrdersPage({
      tab: 'active',
      initialEntries: [{ pathname: '/work-orders', state: { initialTab: 'manage' } }],
    });

    expect(await screen.findByText('Job A')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /manage|الإدارة/i, hidden: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows an empty state on the Active tab when no active work orders exist', async () => {
    // TC-04/AC-4
    mockListEndpoints(mockedApiClient.get, {});

    await renderWorkOrdersPage({ tab: 'active' });

    expect(
      await screen.findByText(/no active work orders found|لا توجد أوامر عمل نشطة/i),
    ).toBeInTheDocument();
  });

  it('renders an active work order with per-type returned/still-out counts', async () => {
    // TC-02/AC-2
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [makeActiveWorkOrder()] });

    await renderWorkOrdersPage({ tab: 'active' });

    expect(await screen.findByText('Summer Gala')).toBeInTheDocument();
    expect(screen.getByText('Acme Events')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.getByText(/^fulfilled$|^تم التنفيذ$/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Bar LED Model A: 1 (returned|تم إرجاعه) \/ 0 (damaged|تالف) \/ 4 (still out|لا يزال خارجًا)/i,
      ),
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
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [primary] });

    await renderWorkOrdersPage({ tab: 'active' });

    await screen.findByText('Summer Gala');
    expect(screen.queryByText('Supplementary A')).not.toBeInTheDocument();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /expand row/i, hidden: true }));

    expect(await screen.findByText('Supplementary A')).toBeInTheDocument();
    expect(screen.getByText('Supplementary B')).toBeInTheDocument();
  });

  // "shows 'Add Supplementary' only on Primary rows, not nested
  // supplementaries" moved to src/features/work-orders/logic.test.ts
  // (isPrimaryWorkOrder) - this was purely testing that one-line predicate
  // via an expensive full mount + expand-row click (previously one of the
  // slowest tests in this file, ~16-27s in isolation even without
  // coverage). The button's positive-case rendering on a Primary row is
  // still proven below ("creates a supplementary WO linked to the chosen
  // Primary" opens it as its first step), so no mount coverage is lost.

  it('creates a supplementary WO linked to the chosen Primary', async () => {
    // TC-01/AC-1: the create modal opened via a Primary row's "Add
    // Supplementary" action posts parent_work_order, and titles itself
    // with the Primary's own reference.
    const primary = makeActiveWorkOrder({ reference: 'WO-1' });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [primary] });
    mockedApiClient.post.mockResolvedValueOnce({
      data: makeWorkOrder({ id: 2, reference: 'WO-1-S1', job_name: 'Extra Lighting' }),
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await screen.findByText('Summer Gala');

    // hidden: true - skips testing-library's default accessibility-tree
    // visibility check, which is what's actually slow here (jsdom resolving
    // antd's CSS var() chains per candidate), not the click/render itself.
    // Safe here since there's only one matching "Add Supplementary"/"OK"
    // button in the tree at a time - no AntD-kept-mounted hidden pane
    // duplicate to collide with.
    await user.click(
      screen.getByRole('button', { name: /add supplementary|إضافة أمر تكميلي/i, hidden: true }),
    );
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
    // Regression: supplementaryParent must reset on close - the Manage
    // tab's plain "New WO" button must never inherit a stale parent from
    // an earlier, abandoned supplementary-create session.
    const workOrders: WorkOrder[] = [];
    mockListEndpoints(mockedApiClient.get, {
      workOrders,
      activeWorkOrders: [makeActiveWorkOrder()],
    });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeWorkOrder() });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await screen.findByText('Summer Gala');

    await user.click(
      screen.getByRole('button', { name: /add supplementary|إضافة أمر تكميلي/i, hidden: true }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));

    await user.click(screen.getByRole('tab', { name: /manage|الإدارة/i, hidden: true }));
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

  // "shows 'Download Packing List' only on Primary rows, not nested
  // supplementaries" / "does not show 'Download Packing List' on a draft
  // Primary WO" moved to logic.test.ts (isPackingListEligible) - same
  // reasoning as the Add Supplementary predicate above. The button's
  // positive-case rendering is still proven below ("downloads the packing
  // list PDF when the button is clicked" opens it as its first step).

  it('downloads the packing list PDF when the button is clicked', async () => {
    // AC-1: clicking "Download Packing List" on a Primary WO triggers a
    // browser download of the PDF the backend returns.
    // WRH-69: this file's coverage-instrumentation overhead applies to
    // every test in it (LESSONS.md's WRH-55 entry), not just new ones -
    // adding the WRH-69 test pushed this and the "drills into..." test
    // below over the global testTimeout under `npm run test:coverage`.
    const primary = makeActiveWorkOrder();
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [primary] });
    const pdfBlob = new Blob(['%PDF-fake'], { type: 'application/pdf' });
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/work-orders/1/packing-list/') {
        return Promise.resolve({ data: pdfBlob });
      }
      if (url === '/api/work-orders/active/') {
        return Promise.resolve({ data: [primary] });
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
    await renderWorkOrdersPage({ tab: 'active' });
    await screen.findByText('Summer Gala');

    await user.click(
      screen.getByRole('button', {
        name: /download packing list|تحميل قائمة التعبئة/i,
        hidden: true,
      }),
    );

    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalledWith(pdfBlob));
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
  }, 45000);

  it('shows a generic error message when the packing list download fails', async () => {
    const primary = makeActiveWorkOrder();
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [primary] });
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
      if (url === '/api/product-types/') {
        return Promise.resolve({ data: [makeProductType()] });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage({ tab: 'active' });
    await screen.findByText('Summer Gala');

    // hidden: true - see the "Add Supplementary" test above for why.
    await user.click(
      screen.getByRole('button', {
        name: /download packing list|تحميل قائمة التعبئة/i,
        hidden: true,
      }),
    );

    expect(
      await screen.findByText(/failed to download the packing list|فشل تحميل قائمة التعبئة/i),
    ).toBeInTheDocument();
  });

  it('shows a closed Primary read-only when it still has an active Supplementary (WRH-69)', async () => {
    // WRH-69: the backend now keeps a terminal Primary visible purely to
    // nest a still-active Supplementary - it must render grayed out/
    // read-only (no Add Supplementary/Return/Transfer/Close), not as a
    // normal actionable row. Four `within(row)` role queries against this
    // file's heaviest page (see LESSONS.md's WRH-55 entry) push this past
    // the global testTimeout even with `hidden: true` - same per-test
    // override precedent as that entry's two tests.
    const closedPrimary = makeActiveWorkOrder({
      status: 'closed',
      supplementaries: [
        makeActiveWorkOrder({ id: 2, job_name: 'Supp A', status: 'partially_returned' }),
      ],
    });
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [closedPrimary] });

    await renderWorkOrdersPage({ tab: 'active' });

    const row = (await screen.findByText('Summer Gala')).closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveStyle({
      backgroundColor: colors.surfaceMuted,
      color: colors.textMuted,
    });
    // Plain text queries, not getByRole/queryByRole - role queries compute
    // each candidate's accessible name, which on this row (for reasons not
    // fully pinned down - possibly an aria-describedby/aria-owns reference
    // out to a portal-rendered element elsewhere in the document) costs
    // ~16s per call instead of the usual sub-second cost `hidden: true`
    // normally gets (see LESSONS.md's WRH-55 entry / feedback_fe_test_perf_
    // root_causes). Button text is unique enough within one row's cell to
    // stand in for role queries here.
    expect(
      within(row as HTMLElement).queryByText(/add supplementary|إضافة أمر تكميلي/i),
    ).not.toBeInTheDocument();
    // Anchored on both ends - "إرجاع" (the Return button's own label) is
    // also a substring of "تم إرجاعه" ("returned"), which the per-type
    // summary column always renders regardless of this row's terminal
    // state, so an unanchored match would false-positive against that.
    expect(within(row as HTMLElement).queryByText(/^return$|^إرجاع$/i)).not.toBeInTheDocument();
    // Still present: informational/non-mutating actions.
    expect(within(row as HTMLElement).getByText(/view details|عرض التفاصيل/i)).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByText(/download packing list|تحميل قائمة التعبئة/i),
    ).toBeInTheDocument();
  });

  it('drills into a work order to show exact serials and their statuses', async () => {
    // TC-03/AC-3
    mockListEndpoints(mockedApiClient.get, { activeWorkOrders: [makeActiveWorkOrder()] });
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

    await renderWorkOrdersPage({ tab: 'active' });

    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: /view details|عرض التفاصيل/i, hidden: true }),
      );

    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText('SN-0001')).toBeInTheDocument();
    expect(within(dialog).getByText(/^out$|^خارج$/i)).toBeInTheDocument();
  }, 45000);
});
