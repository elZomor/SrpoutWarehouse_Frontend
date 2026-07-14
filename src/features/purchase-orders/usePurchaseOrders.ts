import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPurchaseOrder, listPurchaseOrders } from './api';
import type { PurchaseOrderFormValues } from './schema';

const purchaseOrdersBaseKey = ['purchase-orders'] as const;

export function usePurchaseOrders() {
  return useQuery({
    queryKey: purchaseOrdersBaseKey,
    queryFn: () => listPurchaseOrders(),
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PurchaseOrderFormValues) => createPurchaseOrder(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: purchaseOrdersBaseKey }),
  });
}
