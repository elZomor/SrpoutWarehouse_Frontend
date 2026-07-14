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

export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`/api/categories/${id}/`);
}

export async function archiveCategory(id: number): Promise<Category> {
  const { data } = await apiClient.post<Category>(`/api/categories/${id}/archive/`);
  return data;
}
