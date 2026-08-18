import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import {
  buildTransactionListParams,
  getTransactionTypeColor,
  sortTransactionsNewestFirst,
} from './logic';
import type { Transaction } from './types';

// Moved off TransactionLogPage.test.tsx (WRH-34) - "filters by serial
// number/reference/type/date range" and the "combines X and Y filters"
// tests were full page-mount tests standing in for what's pure
// object-construction from each filter's current value. The AND
// combination across filters is the backend's job (DjangoFilterBackend) -
// what's actually under test here is each value's mapping into the params
// object.

const emptyFilters = {
  serialNumber: '',
  referenceNumber: '',
  transactionType: undefined,
  dateRange: null,
};

describe('buildTransactionListParams', () => {
  it('omits every param when no filter is set', () => {
    expect(buildTransactionListParams(emptyFilters)).toEqual({
      serial_number: undefined,
      reference_number: undefined,
      transaction_type: undefined,
      date_from: undefined,
      date_to: undefined,
    });
  });

  it('passes through a serial number filter', () => {
    expect(buildTransactionListParams({ ...emptyFilters, serialNumber: 'SN-042' })).toEqual(
      expect.objectContaining({ serial_number: 'SN-042' }),
    );
  });

  it('passes through a reference number filter', () => {
    expect(buildTransactionListParams({ ...emptyFilters, referenceNumber: 'WO-17' })).toEqual(
      expect.objectContaining({ reference_number: 'WO-17' }),
    );
  });

  it('passes through a transaction type filter', () => {
    expect(buildTransactionListParams({ ...emptyFilters, transactionType: 'receive' })).toEqual(
      expect.objectContaining({ transaction_type: 'receive' }),
    );
  });

  it('formats a full date range', () => {
    const dateRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs('2026-08-01'), dayjs('2026-08-15')];
    expect(buildTransactionListParams({ ...emptyFilters, dateRange })).toEqual(
      expect.objectContaining({ date_from: '2026-08-01', date_to: '2026-08-15' }),
    );
  });

  it('leaves date_from/date_to undefined for a partial (open-ended) range', () => {
    const dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] = [dayjs('2026-08-01'), null];
    expect(buildTransactionListParams({ ...emptyFilters, dateRange })).toEqual(
      expect.objectContaining({ date_from: '2026-08-01', date_to: undefined }),
    );
  });

  it('combines a serial number and a transaction type filter simultaneously', () => {
    expect(
      buildTransactionListParams({
        ...emptyFilters,
        serialNumber: 'SN-042',
        transactionType: 'receive',
      }),
    ).toEqual(expect.objectContaining({ serial_number: 'SN-042', transaction_type: 'receive' }));
  });

  it('combines a serial number and a date range filter simultaneously', () => {
    const dateRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs('2026-08-01'), dayjs('2026-08-15')];
    expect(
      buildTransactionListParams({ ...emptyFilters, serialNumber: 'SN-042', dateRange }),
    ).toEqual(
      expect.objectContaining({
        serial_number: 'SN-042',
        date_from: '2026-08-01',
        date_to: '2026-08-15',
      }),
    );
  });
});

describe('getTransactionTypeColor', () => {
  it('returns a distinct color for a known transaction type', () => {
    expect(getTransactionTypeColor('damaged')).toBe('red');
  });

  it('falls back to the default color for an unknown transaction type', () => {
    expect(getTransactionTypeColor('unknown')).toBe('default');
  });
});

describe('sortTransactionsNewestFirst', () => {
  function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
    return {
      id: 1,
      transaction_type: 'receive',
      transaction_type_display: 'Receive',
      reference_number: '',
      serial_number: 'SN-042',
      product_type_name: 'Bar LED Model A',
      created_at: '2026-08-01T10:00:00Z',
      user_username: 'jane',
      note: '',
      ...overrides,
    };
  }

  it('sorts newest-to-oldest by created_at', () => {
    const oldest = makeTransaction({ id: 1, created_at: '2026-08-01T10:00:00Z' });
    const newest = makeTransaction({ id: 2, created_at: '2026-08-05T10:00:00Z' });

    expect(sortTransactionsNewestFirst([oldest, newest])).toEqual([newest, oldest]);
  });

  it('does not mutate the input array', () => {
    const oldest = makeTransaction({ id: 1, created_at: '2026-08-01T10:00:00Z' });
    const newest = makeTransaction({ id: 2, created_at: '2026-08-05T10:00:00Z' });
    const input = [oldest, newest];

    sortTransactionsNewestFirst(input);

    expect(input).toEqual([oldest, newest]);
  });
});
