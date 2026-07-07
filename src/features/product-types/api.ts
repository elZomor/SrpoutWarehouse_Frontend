import { apiClient } from '../../lib/apiClient';
import type { CreateProductTypeInput, ProductType } from './types';

export async function listProductTypes(search?: string): Promise<ProductType[]> {
  const { data } = await apiClient.get<ProductType[]>('/api/product-types/', {
    params: search ? { search } : undefined,
  });
  return data;
}

export async function createProductType(input: CreateProductTypeInput): Promise<ProductType> {
  const { data } = await apiClient.post<ProductType>('/api/product-types/', input);
  return data;
}
