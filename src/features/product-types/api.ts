import { apiClient } from '../../lib/apiClient';
import type { ProductTypeFormValues } from './schema';
import type { ProductType, ProductTypeStockSummary } from './types';

export async function listProductTypes(search?: string): Promise<ProductType[]> {
  const { data } = await apiClient.get<ProductType[]>('/api/product-types/', {
    params: { search },
  });
  return data;
}

export async function getProductTypeStockSummary(): Promise<ProductTypeStockSummary[]> {
  const { data } = await apiClient.get<ProductTypeStockSummary[]>(
    '/api/product-types/stock-summary/',
  );
  return data;
}

export async function createProductType(input: ProductTypeFormValues): Promise<ProductType> {
  const { data } = await apiClient.post<ProductType>('/api/product-types/', input);
  return data;
}
