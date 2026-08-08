import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { TransactionLogPage } from './TransactionLogPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { Transaction } from '../features/transactions/types';
import { apiClient } from '../lib/apiClient';
import { motionDisabledTheme } from '../test/motionDisabledTheme';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    transaction_type: 'receive',
    transaction_type_display: 'Receive',
    reference_number: 'PO-1',
    serial_number: 'SN-042',
    product_type_name: 'Bar LED Model A',
    created_at: '2026-02-15T10:00:00Z',
    user_username: 'jane',
    note: '',
    ...overrides,
  };
}

interface TransactionListParams {
  serial_number?: string;
  reference_number?: string;
  transaction_type?: string;
  date_from?: string;
  date_to?: string;
}

// Mimics the backend's DjangoFilterBackend AND-of-all-active-filters
// behavior (WRH-49/AC-6) so a combined-filter test can assert against a
// realistic result set rather than a stubbed single response.
function mockTransactionsEndpoint(transactions: Transaction[]) {
  mockedApiClient.get.mockImplementation(
    (url: string, config?: { params?: TransactionListParams }) => {
      if (url !== '/api/transactions/') {
        return Promise.reject(new Error(`Unexpected GET ${url}`));
      }
      const params = config?.params ?? {};
      const results = transactions.filter((transaction) => {
        if (params.serial_number && transaction.serial_number !== params.serial_number) {
          return false;
        }
        if (params.reference_number && transaction.reference_number !== params.reference_number) {
          return false;
        }
        if (params.transaction_type && transaction.transaction_type !== params.transaction_type) {
          return false;
        }
        if (params.date_from && transaction.created_at.slice(0, 10) < params.date_from) {
          return false;
        }
        if (params.date_to && transaction.created_at.slice(0, 10) > params.date_to) {
          return false;
        }
        return true;
      });
      return Promise.resolve({ data: results });
    },
  );
}

function renderTransactionLogPage() {
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
      <ConfigProvider theme={motionDisabledTheme}>
        <AntApp>
          <MemoryRouter initialEntries={['/transaction-log']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/transaction-log" element={<TransactionLogPage />} />
              </Route>
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

describe('TransactionLogPage', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('lists every transaction with its display fields (TC-01/AC-1)', async () => {
    mockTransactionsEndpoint([
      makeTransaction({ id: 1, transaction_type: 'receive', reference_number: 'PO-1' }),
      makeTransaction({ id: 2, transaction_type: 'issue', reference_number: 'WO-1' }),
      makeTransaction({ id: 3, transaction_type: 'damaged', reference_number: '' }),
    ]);

    renderTransactionLogPage();

    expect(await screen.findByText(/^receive$|^استلام$/i)).toBeInTheDocument();
    expect(screen.getByText(/^issue$|^صرف$/i)).toBeInTheDocument();
    expect(screen.getByText(/^damaged$|^تالف$/i)).toBeInTheDocument();
    expect(screen.getByText('PO-1')).toBeInTheDocument();
    expect(screen.getByText('WO-1')).toBeInTheDocument();
    expect(screen.getAllByText('SN-042')).toHaveLength(3);
    expect(screen.getAllByText('Bar LED Model A')).toHaveLength(3);
    expect(screen.getAllByText('jane')).toHaveLength(3);
  });

  it('filters by serial number (TC-02/AC-2)', async () => {
    mockTransactionsEndpoint([
      makeTransaction({ id: 1, serial_number: 'SN-042' }),
      makeTransaction({ id: 2, serial_number: 'SN-099' }),
    ]);

    const user = userEvent.setup();
    renderTransactionLogPage();
    expect(await screen.findAllByText(/SN-0/)).toHaveLength(2);

    await user.type(
      screen.getByPlaceholderText(/filter by serial number|تصفية حسب الرقم التسلسلي/i),
      'SN-042',
    );

    await waitFor(() =>
      expect(mockedApiClient.get).toHaveBeenLastCalledWith('/api/transactions/', {
        params: expect.objectContaining({ serial_number: 'SN-042' }),
      }),
    );
    expect(screen.getByText('SN-042')).toBeInTheDocument();
    expect(screen.queryByText('SN-099')).not.toBeInTheDocument();
  });

  it("renders a serial's filtered transactions in chronological order (AC-2)", async () => {
    // AC-2/TC-02 explicitly require chronological order. The page does no
    // client-side sorting (see TransactionLogPage.tsx's Table dataSource) -
    // it trusts the backend's ordering - so this asserts the page renders
    // whatever order the API returns without silently reordering it.
    mockTransactionsEndpoint([
      makeTransaction({
        id: 1,
        serial_number: 'SN-042',
        reference_number: 'PO-1',
        created_at: '2026-01-01T00:00:00Z',
      }),
      makeTransaction({
        id: 2,
        serial_number: 'SN-042',
        reference_number: 'WO-1',
        created_at: '2026-01-02T00:00:00Z',
      }),
    ]);

    const user = userEvent.setup();
    renderTransactionLogPage();
    expect(await screen.findByText('PO-1')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/filter by serial number|تصفية حسب الرقم التسلسلي/i),
      'SN-042',
    );
    await waitFor(() =>
      expect(mockedApiClient.get).toHaveBeenLastCalledWith('/api/transactions/', {
        params: expect.objectContaining({ serial_number: 'SN-042' }),
      }),
    );

    // Column order is type(0)/reference_number(1)/serial_number(2)/... -
    // see TransactionLogPage.tsx's columns array.
    const dataRows = screen.getAllByRole('row', { hidden: true }).slice(1);
    const referenceCellOrder = dataRows.map(
      (row) => within(row).getAllByRole('cell', { hidden: true })[1]?.textContent,
    );
    expect(referenceCellOrder).toEqual(['PO-1', 'WO-1']);
  });

  // "filters by work order reference" / "filters by transaction type" /
  // "combines serial number and type filters" / "filters by date range" /
  // "combines serial number and date range filters" all moved to
  // src/features/transactions/logic.test.ts (buildTransactionListParams) -
  // "filters by serial number" above already proves the debounce ->
  // useTransactions wiring end-to-end for this filter-params flow; the
  // AND-combination itself is the backend's job (DjangoFilterBackend), not
  // page logic.

  it('shows an empty state with no error when filters match nothing (TC-07)', async () => {
    mockTransactionsEndpoint([makeTransaction({ id: 1, serial_number: 'SN-042' })]);

    const user = userEvent.setup();
    renderTransactionLogPage();
    expect(await screen.findByText('SN-042')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/filter by serial number|تصفية حسب الرقم التسلسلي/i),
      'SN-does-not-exist',
    );

    await waitFor(() =>
      expect(mockedApiClient.get).toHaveBeenLastCalledWith('/api/transactions/', {
        params: expect.objectContaining({ serial_number: 'SN-does-not-exist' }),
      }),
    );
    expect(screen.queryByText('SN-042')).not.toBeInTheDocument();
    expect(screen.getByText(/no transactions found|لا توجد معاملات/i)).toBeInTheDocument();
  });

  it('renders no edit or delete action on any transaction row (WRH-50/AC-1,AC-2/TC-01,TC-02)', async () => {
    // TransactionLogPage's columns array (see TransactionLogPage.tsx) has
    // no actions column at all, and useTransactions/api.ts expose no
    // update/delete operation to wire one up to - this asserts that
    // negative directly against the rendered table rather than just
    // trusting the columns array stays that way.
    mockTransactionsEndpoint([
      makeTransaction({ id: 1 }),
      makeTransaction({ id: 2, transaction_type: 'issue' }),
    ]);

    renderTransactionLogPage();
    expect(await screen.findAllByText('SN-042')).toHaveLength(2);

    expect(
      screen.queryByRole('button', { name: /edit|تعديل/i, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /delete|حذف/i, hidden: true }),
    ).not.toBeInTheDocument();
    const headerCells = screen.getAllByRole('columnheader', { hidden: true });
    expect(headerCells.some((cell) => /actions|إجراءات/i.test(cell.textContent ?? ''))).toBe(false);
  });

  it('shows an error banner when the transactions request fails', async () => {
    mockedApiClient.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    renderTransactionLogPage();

    expect(
      await screen.findByText(/failed to load transaction log|فشل تحميل سجل المعاملات/i),
    ).toBeInTheDocument();
  });
});
