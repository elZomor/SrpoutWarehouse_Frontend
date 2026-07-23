import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createProductType, getProductTypeStockSummary, listProductTypes } from './api';
import type { ProductTypeFormValues } from './schema';

const productTypesBaseKey = ['product-types'] as const;

const productTypesQueryKey = (search: string) => [...productTypesBaseKey, search] as const;

const productTypeStockSummaryKey = [...productTypesBaseKey, 'stock-summary'] as const;

export function useProductTypes(search: string) {
  return useQuery({
    queryKey: productTypesQueryKey(search),
    queryFn: () => listProductTypes(search || undefined),
  });
}

export function useProductTypeStockSummary() {
  return useQuery({
    queryKey: productTypeStockSummaryKey,
    queryFn: () => getProductTypeStockSummary(),
  });
}

export function useCreateProductType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProductTypeFormValues) => createProductType(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productTypesBaseKey }),
  });
}
