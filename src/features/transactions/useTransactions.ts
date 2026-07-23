import { useQuery } from '@tanstack/react-query';
import { listTransactions, type ListTransactionsParams } from './api';

const transactionsBaseKey = ['transactions'] as const;

const transactionsQueryKey = (params: ListTransactionsParams) =>
  [...transactionsBaseKey, params] as const;

export function useTransactions(params: ListTransactionsParams) {
  return useQuery({
    queryKey: transactionsQueryKey(params),
    queryFn: () => listTransactions(params),
  });
}
