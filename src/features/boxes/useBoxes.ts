import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBox, listBoxes } from './api';
import type { BoxFormValues } from './schema';

const boxesBaseKey = ['boxes'] as const;

export function useBoxes() {
  return useQuery({
    queryKey: boxesBaseKey,
    queryFn: () => listBoxes(),
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
