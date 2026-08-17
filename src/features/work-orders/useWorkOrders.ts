import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeWorkOrder,
  completeWorkOrder,
  createWorkOrder,
  downloadWorkOrderPackingList,
  getWorkOrder,
  listActiveWorkOrders,
  listWorkOrders,
  returnWorkOrderBox,
  returnWorkOrderItem,
  scanWorkOrderBox,
  scanWorkOrderItem,
  startWorkOrder,
  transferWorkOrderItem,
} from './api';
import type {
  ReturnItemFormValues,
  ScanItemFormValues,
  TransferItemFormValues,
  WorkOrderFormValues,
} from './schema';
import type { WorkOrder } from './types';

const workOrdersBaseKey = ['work-orders'] as const;
const activeWorkOrdersKey = ['work-orders', 'active'] as const;
const workOrderDetailKey = (workOrderId: number) => ['work-orders', 'detail', workOrderId] as const;

// activeWorkOrdersKey is a separate cache from workOrdersBaseKey (its shape
// - nested supplementaries, returned/still_out counts - can't be derived
// from a mutation's flat WorkOrder response) - every mutation that can
// change a WO's status/line-item state needs to invalidate it explicitly.
function invalidateActiveWorkOrders(
  queryClient: ReturnType<typeof useQueryClient>,
  workOrderId?: number,
) {
  queryClient.invalidateQueries({ queryKey: activeWorkOrdersKey });
  if (workOrderId !== undefined) {
    queryClient.invalidateQueries({ queryKey: workOrderDetailKey(workOrderId) });
  }
}

// WRH-75: the merged screen's single table reads its Status column off
// workOrdersBaseKey for every row, so a mutation whose response doesn't get
// patched directly into that cache (useStartWorkOrder/useCompleteWorkOrder
// patch it themselves - see patchWorkOrder below - so they don't need this)
// needs it invalidated too, not just activeWorkOrdersKey. return_item()/
// return_box()'s session-close path is the case that matters here - its
// response (WorkOrderReturnResult) doesn't match workOrdersBaseKey's flat
// WorkOrder shape closely enough to patch directly (see
// useReturnWorkOrderItem's own comment).
function invalidateWorkOrderCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  workOrderId?: number,
) {
  queryClient.invalidateQueries({ queryKey: workOrdersBaseKey });
  invalidateActiveWorkOrders(queryClient, workOrderId);
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
      // WRH-53: a new WO can now be a supplementary nested under an
      // existing Primary (WorkOrdersPage merges parent_work_order into the
      // payload when created via a Primary row's "Add Supplementary"
      // action) as well as a brand-new Primary - either way the Active
      // tab's nested list needs a refetch, so this stays a blanket
      // invalidation rather than trying to patch the nested shape locally.
      invalidateWorkOrderCaches(queryClient);
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

export function useScanWorkOrderBox(workOrderId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boxCode: string) => scanWorkOrderBox(workOrderId, boxCode),
    // Same reasoning as useScanWorkOrderItem: patch the freshly-recomputed
    // WorkOrder straight into the cached list rather than invalidating -
    // the Active tab's cache is caught up once by closeFulfillmentModal
    // when the session ends, not on every box scan.
    onSuccess: (response) => patchWorkOrder(queryClient)(response.work_order),
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

export function useReturnWorkOrderItem(workOrderId: number) {
  // Its response (WorkOrderReturnResult) doesn't match either cached
  // shape (WorkOrder's flat list, ActiveWorkOrder's nested
  // supplementaries) - the page keeps the running return session as local
  // state instead (mirrors fulfillingWorkOrder's derivation, but return
  // sessions are opened from the Active tab, which has no matching flat
  // cache to patch). WorkOrdersPage invalidates the Active tab + detail
  // caches once the session closes, matching closeFulfillmentModal's
  // identical end-of-session invalidation.
  return useMutation({
    mutationFn: (input: ReturnItemFormValues) => returnWorkOrderItem(workOrderId, input),
  });
}

export function useReturnWorkOrderBox(workOrderId: number) {
  // Same reasoning as useReturnWorkOrderItem: its response doesn't match
  // either cached shape, so the page keeps the running return session as
  // local state instead of patching a query cache here.
  return useMutation({
    mutationFn: (boxCode: string) => returnWorkOrderBox(workOrderId, boxCode),
  });
}

export function useTransferWorkOrderItem(workOrderId: number) {
  // Its response (WorkOrderTransferResult) doesn't match either cached
  // shape either, and neither WO's status/line items actually change (see
  // the backend's transfer() comment) - so, same reasoning as
  // useReturnWorkOrderItem, no query cache is patched or invalidated here.
  return useMutation({
    mutationFn: (input: TransferItemFormValues) => transferWorkOrderItem(workOrderId, input),
  });
}

export function useCloseWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workOrderId: number) => closeWorkOrder(workOrderId),
    onSuccess: (_result, workOrderId) => {
      // Its response (work_order: WorkOrderReturnResult) doesn't match
      // workOrdersBaseKey's flat WorkOrder shape (missing reference,
      // client_name, expected_date_out, etc.) unlike useStartWorkOrder/
      // useCompleteWorkOrder, so invalidate both caches instead of patching.
      invalidateWorkOrderCaches(queryClient, workOrderId);
    },
  });
}

export function useDownloadWorkOrderPackingList() {
  return useMutation({
    mutationFn: (workOrderId: number) => downloadWorkOrderPackingList(workOrderId),
  });
}

// WorkOrdersPage's closeFulfillmentModal: every scan/complete during that
// session already patched workOrdersBaseKey directly (see
// useScanWorkOrderItem/useCompleteWorkOrder above), so this only needs to
// catch up activeWorkOrdersKey once the session ends - invalidating
// workOrdersBaseKey too would just be a redundant refetch.
export function useInvalidateActiveWorkOrders() {
  const queryClient = useQueryClient();
  return (workOrderId?: number) => invalidateActiveWorkOrders(queryClient, workOrderId);
}

// WorkOrdersPage's closeReturnModal: return_item()/return_box() never patch
// workOrdersBaseKey (see invalidateWorkOrderCaches's own comment), so that
// cache needs invalidating here too, not just activeWorkOrdersKey.
export function useInvalidateWorkOrders() {
  const queryClient = useQueryClient();
  return (workOrderId?: number) => invalidateWorkOrderCaches(queryClient, workOrderId);
}
