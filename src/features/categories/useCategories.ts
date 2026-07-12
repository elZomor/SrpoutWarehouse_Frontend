import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCategory, listCategories } from './api';
import type { CategoryFormValues } from './schema';

const categoriesBaseKey = ['categories'] as const;

const categoriesQueryKey = (search: string) => [...categoriesBaseKey, search] as const;

export function useCategories(search: string) {
  return useQuery({
    queryKey: categoriesQueryKey(search),
    queryFn: () => listCategories(search || undefined),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CategoryFormValues) => createCategory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesBaseKey }),
  });
}
