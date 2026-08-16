import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBox, getBox, listBoxes } from './api';
import type { BoxFormValues } from './schema';

const boxesBaseKey = ['boxes'] as const;

export function useBoxes() {
  return useQuery({
    queryKey: boxesBaseKey,
    queryFn: () => listBoxes(),
  });
}

// WRH-71/AC-1: only fetches once a box detail view is opened (`enabled`) -
// matches useSerializedItems' identical opt-in-fetch shape for the
// dashboard's stock-summary detail modal. staleTime: 0 (overriding the
// app default) so AC-5's "currently assigned" is actually current - reusing
// a cached entry from a previous open of the same box could otherwise serve
// contents that changed in between.
export function useBox(id: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...boxesBaseKey, id],
    queryFn: () => getBox(id!),
    enabled: enabled && id !== undefined,
    staleTime: 0,
  });
}

export function useCreateBox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BoxFormValues) => createBox(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boxesBaseKey });
      // Boxed items move out of "available" - any serialized-items list/
      // filter showing status needs to refetch rather than go stale.
      queryClient.invalidateQueries({ queryKey: ['serialized-items'] });
    },
  });
}
