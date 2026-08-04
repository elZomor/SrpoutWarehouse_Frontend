import type { Dayjs } from 'dayjs';
import type { ListTransactionsParams } from './api';

const DATE_FORMAT = 'YYYY-MM-DD';

export interface TransactionListFilters {
  serialNumber: string;
  referenceNumber: string;
  transactionType: string | undefined;
  dateRange: [Dayjs | null, Dayjs | null] | null;
}

// Extracted out of TransactionLogPage.tsx (WRH-34 test-suite rework) - was
// an inline object literal passed straight to useTransactions, unit-tested
// only by mounting the whole page. The multi-filter AND combination itself
// is the backend's job (DjangoFilterBackend) - this only builds the params
// object each filter's current value maps to (empty string -> undefined,
// Dayjs range -> formatted date strings or undefined).
export function buildTransactionListParams({
  serialNumber,
  referenceNumber,
  transactionType,
  dateRange,
}: TransactionListFilters): ListTransactionsParams {
  return {
    serial_number: serialNumber || undefined,
    reference_number: referenceNumber || undefined,
    transaction_type: transactionType,
    date_from: dateRange?.[0] ? dateRange[0].format(DATE_FORMAT) : undefined,
    date_to: dateRange?.[1] ? dateRange[1].format(DATE_FORMAT) : undefined,
  };
}
