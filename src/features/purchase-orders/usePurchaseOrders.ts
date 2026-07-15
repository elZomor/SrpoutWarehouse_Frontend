import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPurchaseOrder, listPurchaseOrders, receivePurchaseOrderItem } from './api';
import type { PurchaseOrderFormValues, ReceiveItemFormValues } from './schema';
import type { PurchaseOrder } from './types';

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

export function useReceivePurchaseOrderItem(purchaseOrderId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReceiveItemFormValues) => receivePurchaseOrderItem(purchaseOrderId, input),
    // The backend returns the full, freshly-recomputed PurchaseOrder on
    // every scan - patch it straight into the cached list rather than
    // invalidating and refetching, since a scan gun fires many of these in
    // quick succession and each one already carries the up-to-date data.
    onSuccess: (updatedPurchaseOrder) => {
      queryClient.setQueryData<PurchaseOrder[]>(purchaseOrdersBaseKey, (current) =>
        current?.map((purchaseOrder) =>
          purchaseOrder.id === updatedPurchaseOrder.id ? updatedPurchaseOrder : purchaseOrder,
        ),
      );
    },
  });
}
