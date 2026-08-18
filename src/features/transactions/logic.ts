import type { Dayjs } from 'dayjs';
import type { ListTransactionsParams } from './api';
import type { Transaction } from './types';

const DATE_FORMAT = 'YYYY-MM-DD';

// WRH-79: keyed by transaction_type (not the backend's
// transaction_type_display) so the label always goes through i18n, and a
// Map avoids eslint-plugin-security's detect-object-injection warning on
// the dynamic-key lookup - matches SerializedItemsPage's STATUS_COLORS
// precedent. Moved here (out of TransactionLogPage, its original home)
// since ItemHistoryModal now needs the identical mapping.
const TRANSACTION_TYPE_COLORS = new Map<string, string>([
  ['receive', 'green'],
  ['issue', 'blue'],
  ['return', 'cyan'],
  ['damaged', 'red'],
  ['transfer', 'purple'],
  ['missing', 'orange'],
  ['written_off', 'default'],
]);
const DEFAULT_TRANSACTION_TYPE_COLOR = 'default';

export function getTransactionTypeColor(transactionType: string): string {
  return TRANSACTION_TYPE_COLORS.get(transactionType) ?? DEFAULT_TRANSACTION_TYPE_COLOR;
}

// AC-3: item history is sorted newest-to-oldest, opposite of Transaction's
// own ["created_at", "id"] ascending Meta.ordering - sort client-side
// rather than relying on backend order.
export function sortTransactionsNewestFirst(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

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
