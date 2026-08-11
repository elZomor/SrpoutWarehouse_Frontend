import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listMissingItems, markMissingItemFound, writeOffMissingItem } from './api';

const missingItemsBaseKey = ['missing-items'] as const;

export function useMissingItems() {
  return useQuery({
    queryKey: missingItemsBaseKey,
    queryFn: listMissingItems,
  });
}

export function useMarkMissingItemFound() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => markMissingItemFound(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: missingItemsBaseKey }),
  });
}

export function useWriteOffMissingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => writeOffMissingItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: missingItemsBaseKey }),
  });
}
