import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completeWorkOrder,
  createWorkOrder,
  getWorkOrder,
  listActiveWorkOrders,
  listWorkOrders,
  scanWorkOrderItem,
  startWorkOrder,
} from './api';
import type { ScanItemFormValues, WorkOrderFormValues } from './schema';
import type { WorkOrder } from './types';

const workOrdersBaseKey = ['work-orders'] as const;
const activeWorkOrdersKey = ['work-orders', 'active'] as const;
const workOrderDetailKey = (workOrderId: number) => ['work-orders', 'detail', workOrderId] as const;

// The Active tab's query is a separate cache from workOrdersBaseKey (its
// shape - nested supplementaries, returned/still_out counts - can't be
// derived from a mutation's flat WorkOrder response), and AntD Tabs keeps
// an already-rendered pane mounted after switching away from it, so it
// never remounts to pick up a stale result on its own - every Manage-tab
// mutation that can change a WO's status/line-item state needs to
// invalidate it explicitly or the Active tab silently goes stale.
function invalidateActiveWorkOrders(
  queryClient: ReturnType<typeof useQueryClient>,
  workOrderId?: number,
) {
  queryClient.invalidateQueries({ queryKey: activeWorkOrdersKey });
  if (workOrderId !== undefined) {
    queryClient.invalidateQueries({ queryKey: workOrderDetailKey(workOrderId) });
  }
}

export function useWorkOrders() {
  return useQuery({
    queryKey: workOrdersBaseKey,
    queryFn: () => listWorkOrders(),
  });
}

export function useActiveWorkOrders() {
  return useQuery({
    queryKey: activeWorkOrdersKey,
    queryFn: () => listActiveWorkOrders(),
  });
}

export function useWorkOrderDetail(workOrderId: number | null) {
  return useQuery({
    queryKey: workOrderDetailKey(workOrderId ?? 0),
    queryFn: () => getWorkOrder(workOrderId as number),
    enabled: workOrderId !== null,
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: WorkOrderFormValues) => createWorkOrder(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workOrdersBaseKey });
      // A new WO has no way to be created as a supplementary yet (see
      // WorkOrderActiveSupplementarySerializer's backend comment) - it's
      // always a new Primary row on the Active tab.
      invalidateActiveWorkOrders(queryClient);
    },
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
    onSuccess: (updatedWorkOrder) => {
      patchWorkOrder(queryClient)(updatedWorkOrder);
      invalidateActiveWorkOrders(queryClient, updatedWorkOrder.id);
    },
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
    // reasoning. Deliberately does NOT invalidate the Active tab's cache
    // here too (that would refetch on every single scan) - WorkOrdersPage's
    // closeFulfillmentModal invalidates it once when the scan session ends
    // instead.
    onSuccess: patchWorkOrder(queryClient),
  });
}

export function useCompleteWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workOrderId: number) => completeWorkOrder(workOrderId),
    onSuccess: (updatedWorkOrder) => {
      patchWorkOrder(queryClient)(updatedWorkOrder);
      invalidateActiveWorkOrders(queryClient, updatedWorkOrder.id);
    },
  });
}

export function useInvalidateActiveWorkOrders() {
  const queryClient = useQueryClient();
  return (workOrderId?: number) => invalidateActiveWorkOrders(queryClient, workOrderId);
}
