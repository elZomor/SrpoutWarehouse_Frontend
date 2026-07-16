import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkOrder, listWorkOrders } from './api';
import type { WorkOrderFormValues } from './schema';

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
