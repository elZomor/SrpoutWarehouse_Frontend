import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMaintenanceOrder, listMaintenanceOrders } from './api';
import type { MaintenanceOrderFormValues } from './schema';

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
