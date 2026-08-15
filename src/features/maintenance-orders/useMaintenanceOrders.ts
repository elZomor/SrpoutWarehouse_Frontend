import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMaintenanceOrder, listMaintenanceOrders, resolveMaintenanceOrderItem } from './api';
import type { MaintenanceOrderFormValues } from './schema';
import type { MaintenanceOrderResolution } from './types';

const maintenanceOrdersBaseKey = ['maintenance-orders'] as const;

export function useMaintenanceOrders() {
  return useQuery({
    queryKey: maintenanceOrdersBaseKey,
    queryFn: () => listMaintenanceOrders(),
  });
}

export function useCreateMaintenanceOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MaintenanceOrderFormValues) => createMaintenanceOrder(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceOrdersBaseKey });
      // Claimed items move out of "damaged" into "in_maintenance" - any
      // serialized-items list/filter showing status needs to refetch
      // rather than go stale, matching useCreateBox's identical reasoning.
      queryClient.invalidateQueries({ queryKey: ['serialized-items'] });
    },
  });
}

export function useResolveMaintenanceOrderItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      maintenanceOrderId,
      itemId,
      resolution,
    }: {
      maintenanceOrderId: number;
      itemId: number;
      resolution: MaintenanceOrderResolution;
    }) => resolveMaintenanceOrderItem(maintenanceOrderId, itemId, resolution),
    // `invalidateQueries()` returns a promise that resolves once the
    // invalidated query has actually refetched (not just been marked
    // stale). Returning the combined promise from onSuccess (rather than
    // firing these and letting the callback return undefined) makes
    // mutateAsync's own returned promise wait for the refetches too - a
    // page reading `mutation.isPending` to gate a "same data is still
    // stale" UI (see MaintenanceOrdersPage's per-item resolve buttons)
    // would otherwise see isPending flip to false while the list/stock
    // queries are still mid-refetch, one render before the UI actually
    // reflects the change.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: maintenanceOrdersBaseKey }),
        // Resolving flips the item's status (-> available/written_off) -
        // the same field SerializedItemsPage's list and the Dashboard's
        // stock summary read, matching useMissingItems.ts's identical
        // invalidateAfterResolution reasoning for the sibling resolve flow.
        queryClient.invalidateQueries({ queryKey: ['serialized-items'] }),
        queryClient.invalidateQueries({ queryKey: ['product-types', 'stock-summary'] }),
      ]),
  });
}
