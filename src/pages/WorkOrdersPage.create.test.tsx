import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkOrder } from '../features/work-orders/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';
import {
  fillExpectedDateOut,
  makeProductType,
  makeWorkOrder,
  mockListEndpoints,
  renderWorkOrdersPage,
  selectProductTypeForLineItem,
} from './workOrdersTestSupport';

// Split out of WorkOrdersPage.test.tsx (WRH-34) - see workOrdersTestSupport's
// header comment. This file covers the Manage tab's create-WO flow and the
// flat work-orders list itself.

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

describe('WorkOrdersPage - create', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders work orders returned from the API', async () => {
    // TC-02/AC-1: reference, job name, client, date, and line items all
    // display.
    mockListEndpoints(mockedApiClient.get, { workOrders: [makeWorkOrder()] });

    await renderWorkOrdersPage();

    expect(await screen.findByText('Summer Gala')).toBeInTheDocument();
    expect(screen.getByText('WO-1')).toBeInTheDocument();
    expect(screen.getByText('Acme Events')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.getByText(/^draft$|^مسودة$/i)).toBeInTheDocument();
    expect(screen.getByText('jane')).toBeInTheDocument();
    expect(screen.getByText(/Bar LED Model A × 5/)).toBeInTheDocument();
  });

  it('creates a work order with one line item', async () => {
    // TC-01/AC-1
    const workOrders: WorkOrder[] = [];
    mockListEndpoints(mockedApiClient.get, { workOrders });
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
    mockListEndpoints(mockedApiClient.get, { workOrders });
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
    mockListEndpoints(mockedApiClient.get, { workOrders, productTypes });
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
    mockListEndpoints(mockedApiClient.get, {});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/job name is required|اسم المهمة مطلوب/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires an expected date out before submitting', async () => {
    mockListEndpoints(mockedApiClient.get, {});

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
    mockListEndpoints(mockedApiClient.get, {});

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
    mockListEndpoints(mockedApiClient.get, {});

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
    mockListEndpoints(mockedApiClient.get, {});
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
    mockListEndpoints(mockedApiClient.get, { workOrdersError: true });

    await renderWorkOrdersPage();

    expect(
      await screen.findByText(/failed to load work orders|فشل تحميل أوامر العمل/i),
    ).toBeInTheDocument();
  });
});
