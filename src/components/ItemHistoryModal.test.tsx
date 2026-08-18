import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { ItemHistoryModal, type ItemHistoryTarget } from './ItemHistoryModal';
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

const ITEM: ItemHistoryTarget = {
  serial_number: 'SN-042',
  product_type_name: 'Bar LED Model A',
  status: 'out',
};

function renderModal(item: ItemHistoryTarget | null, open: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={motionDisabledTheme}>
        <AntApp>
          <ItemHistoryModal item={item} open={open} onClose={vi.fn()} />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

describe('ItemHistoryModal', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('does not query transactions when closed', () => {
    // AC-1: only fetches once opened.
    renderModal(null, false);

    expect(mockedApiClient.get).not.toHaveBeenCalled();
  });

  it('shows item identity, status, and history sorted newest-to-oldest', async () => {
    // AC-2/AC-3
    const transactions: Transaction[] = [
      {
        id: 1,
        transaction_type: 'receive',
        transaction_type_display: 'Receive',
        reference_number: 'PO-1',
        serial_number: 'SN-042',
        product_type_name: 'Bar LED Model A',
        created_at: '2026-08-01T10:00:00Z',
        user_username: 'jane',
        note: '',
      },
      {
        id: 2,
        transaction_type: 'issue',
        transaction_type_display: 'Issue',
        reference_number: 'WO-1',
        serial_number: 'SN-042',
        product_type_name: 'Bar LED Model A',
        created_at: '2026-08-05T10:00:00Z',
        user_username: 'jane',
        note: 'handed off on site',
      },
    ];
    mockedApiClient.get.mockImplementation((url: string) => {
      if (url === '/api/transactions/') {
        return Promise.resolve({ data: transactions });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    renderModal(ITEM, true);

    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText('Bar LED Model A — SN-042')).toBeInTheDocument();
    expect(await within(dialog).findByText('handed off on site')).toBeInTheDocument();

    const rows = within(dialog).getAllByRole('row', { hidden: true });
    const rowsText = rows.map((row) => row.textContent ?? '');
    expect(rowsText.findIndex((text) => text.includes('WO-1'))).toBeLessThan(
      rowsText.findIndex((text) => text.includes('PO-1')),
    );
  });

  it('shows an empty-state message when the item has no history', async () => {
    // AC-4
    mockedApiClient.get.mockResolvedValue({ data: [] });

    renderModal(ITEM, true);

    expect(
      await screen.findByText(/no history yet for this item|لا يوجد سجل لهذا العنصر بعد/i),
    ).toBeInTheDocument();
  });

  it('shows an error message when the history fails to load', async () => {
    mockedApiClient.get.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });

    renderModal(ITEM, true);

    expect(
      await screen.findByText(/failed to load item history|فشل تحميل سجل العنصر/i),
    ).toBeInTheDocument();
  });
});
