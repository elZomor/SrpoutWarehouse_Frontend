import { apiClient } from '../../lib/apiClient';
import type { Transaction } from './types';

export interface ListTransactionsParams {
  serial_number?: string;
  reference_number?: string;
  transaction_type?: string;
  date_from?: string;
  date_to?: string;
}

export async function listTransactions(params: ListTransactionsParams): Promise<Transaction[]> {
  const { data } = await apiClient.get<Transaction[]>('/api/transactions/', { params });
  return data;
}
