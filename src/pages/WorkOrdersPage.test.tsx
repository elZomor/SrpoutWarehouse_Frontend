import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { WorkOrdersPage } from './WorkOrdersPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { ProductType } from '../features/product-types/types';
import type { WorkOrder } from '../features/work-orders/types';
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
      },
    ],
    ...overrides,
  };
}

// GET calls are routed by URL rather than call order, since the page fires
// both the work-orders list query and the product-types dropdown query on
// mount and the two aren't guaranteed to resolve in declaration order.
function mockListEndpoints({
  workOrders = [],
  productTypes = [makeProductType()],
  workOrdersError = false,
}: {
  workOrders?: WorkOrder[];
  productTypes?: ProductType[];
  workOrdersError?: boolean;
}) {
  mockedApiClient.get.mockImplementation((url: string) => {
    if (url === '/api/product-types/') {
      return Promise.resolve({ data: productTypes });
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

function renderWorkOrdersPage() {
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

  return render(
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
}

async function fillExpectedDateOut(user: ReturnType<typeof userEvent.setup>, value: string) {
  // {Enter} confirms the typed date and closes only the DatePicker's own
  // popup panel - {Escape} would bubble up and close the whole Modal too,
  // since AntD's Modal also listens for Escape to cancel.
  const dateInput = screen.getByLabelText(/expected date out|تاريخ الخروج المتوقع/i);
  await user.type(dateInput, `${value}{Enter}`);
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

    renderWorkOrdersPage();

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
    renderWorkOrdersPage();

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
    renderWorkOrdersPage();

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
    renderWorkOrdersPage();

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
    renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/job name is required|اسم المهمة مطلوب/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires an expected date out before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWorkOrdersPage();

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
    renderWorkOrdersPage();

    await user.click(await screen.findByRole('button', { name: /new wo|أمر عمل جديد/i }));
    await user.type(screen.getByLabelText(/job name|اسم المهمة/i), 'Summer Gala');
    await fillExpectedDateOut(user, '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/product type is required|نوع المنتج مطلوب/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/quantity must be at least 1|يجب أن تكون الكمية 1 على الأقل/i),
    ).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('removes an added line item', async () => {
    mockListEndpoints({});

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWorkOrdersPage();

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
    renderWorkOrdersPage();

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

    renderWorkOrdersPage();

    expect(
      await screen.findByText(/failed to load work orders|فشل تحميل أوامر العمل/i),
    ).toBeInTheDocument();
  });
});
