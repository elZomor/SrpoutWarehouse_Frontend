import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createProductType, listProductTypes } from './api';
import type { ProductTypeFormValues } from './schema';

const productTypesBaseKey = ['product-types'] as const;

const productTypesQueryKey = (search: string) => [...productTypesBaseKey, search] as const;

export function useProductTypes(search: string) {
  return useQuery({
    queryKey: productTypesQueryKey(search),
    queryFn: () => listProductTypes(search || undefined),
  });
}

export function useCreateProductType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProductTypeFormValues) => createProductType(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productTypesBaseKey }),
  });
}
