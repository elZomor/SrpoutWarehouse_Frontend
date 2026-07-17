import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completeWorkOrder,
  createWorkOrder,
  listWorkOrders,
  scanWorkOrderItem,
  startWorkOrder,
} from './api';
import type { ScanItemFormValues, WorkOrderFormValues } from './schema';
import type { WorkOrder } from './types';

const workOrdersBaseKey = ['work-orders'] as const;

export function useWorkOrders() {
  return useQuery({
    queryKey: workOrdersBaseKey,
    queryFn: () => listWorkOrders(),
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: WorkOrderFormValues) => createWorkOrder(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workOrdersBaseKey }),
  });
}

function patchWorkOrder(queryClient: ReturnType<typeof useQueryClient>) {
  return (updatedWorkOrder: WorkOrder) => {
    queryClient.setQueryData<WorkOrder[]>(workOrdersBaseKey, (current) =>
      current?.map((workOrder) =>
        workOrder.id === updatedWorkOrder.id ? updatedWorkOrder : workOrder,
      ),
    );
  };
}

export function useStartWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workOrderId: number) => startWorkOrder(workOrderId),
    onSuccess: patchWorkOrder(queryClient),
  });
}

export function useScanWorkOrderItem(workOrderId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ScanItemFormValues) => scanWorkOrderItem(workOrderId, input),
    // The backend returns the full, freshly-recomputed WorkOrder on every
    // scan - patch it straight into the cached list rather than
    // invalidating and refetching, since a scan gun fires many of these in
    // quick succession and each one already carries the up-to-date data.
    // Matches PurchaseOrders' useReceivePurchaseOrderItem's identical
    // reasoning.
    onSuccess: patchWorkOrder(queryClient),
  });
}

export function useCompleteWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workOrderId: number) => completeWorkOrder(workOrderId),
    onSuccess: patchWorkOrder(queryClient),
  });
}
