import { apiClient } from '../../lib/apiClient';
import type { CategoryFormValues } from './schema';
import type { Category } from './types';

export async function listCategories(search?: string): Promise<Category[]> {
  const { data } = await apiClient.get<Category[]>('/api/categories/', {
    params: { search },
  });
  return data;
}

export async function createCategory(input: CategoryFormValues): Promise<Category> {
  const { data } = await apiClient.post<Category>('/api/categories/', input);
  return data;
}
