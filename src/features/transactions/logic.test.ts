import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { buildTransactionListParams } from './logic';

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
