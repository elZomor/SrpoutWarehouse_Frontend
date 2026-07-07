import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createProductType, listProductTypes } from './api';
import type { CreateProductTypeInput } from './types';

export const productTypesQueryKey = (search: string) => ['product-types', search] as const;

export function useProductTypes(search: string) {
  return useQuery({
    queryKey: productTypesQueryKey(search),
    queryFn: () => listProductTypes(search || undefined),
  });
}

export function useCreateProductType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductTypeInput) => createProductType(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-types'] });
    },
  });
}
