import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listMissingItems, markMissingItemFound, writeOffMissingItem } from './api';

const missingItemsBaseKey = ['missing-items'] as const;

export function useMissingItems() {
  return useQuery({
    queryKey: missingItemsBaseKey,
    queryFn: listMissingItems,
  });
}

// Both resolution mutations flip SerializedItem.status (missing ->
// available/written_off), the same field SerializedItemsPage's list and the
// Dashboard's stock summary ("Missing" column) read - matches
// useBoxes.ts's useCreateBox(), which invalidates 'serialized-items'
// alongside its own key for the identical "status changed elsewhere"
// reason, rather than leaving those views stale for queryClient's 30s
// staleTime.
function invalidateAfterResolution(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: missingItemsBaseKey });
  queryClient.invalidateQueries({ queryKey: ['serialized-items'] });
  queryClient.invalidateQueries({ queryKey: ['product-types', 'stock-summary'] });
}

export function useMarkMissingItemFound() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => markMissingItemFound(id),
    onSuccess: () => invalidateAfterResolution(queryClient),
  });
}

export function useWriteOffMissingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => writeOffMissingItem(id),
    onSuccess: () => invalidateAfterResolution(queryClient),
  });
}
