import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDamageReport, listDamageReports } from './api';
import type { DamageReportFormValues } from './schema';

const damageReportsBaseKey = ['damage-reports'] as const;

export function useDamageReports() {
  return useQuery({
    queryKey: damageReportsBaseKey,
    queryFn: listDamageReports,
  });
}

export function useCreateDamageReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DamageReportFormValues) => createDamageReport(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: damageReportsBaseKey });
      // Creating a report flips the target SerializedItem.status
      // available -> damaged, the same field SerializedItemsPage's list
      // and the Dashboard's stock summary read - matches
      // useMissingItems.ts's identical cross-cache invalidation for the
      // same reason (see its own comment, WRH-42/round-1 review finding).
      queryClient.invalidateQueries({ queryKey: ['serialized-items'] });
      queryClient.invalidateQueries({ queryKey: ['product-types', 'stock-summary'] });
    },
  });
}
