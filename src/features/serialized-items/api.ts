import { apiClient } from '../../lib/apiClient';
import type { SerializedItemFormValues } from './schema';
import type { SerializedItem } from './types';

export interface ListSerializedItemsParams {
  search?: string;
  product_type?: number;
}

export async function listSerializedItems(
  params: ListSerializedItemsParams,
): Promise<SerializedItem[]> {
  const { data } = await apiClient.get<SerializedItem[]>('/api/serialized-items/', {
    params,
  });
  return data;
}

export async function createSerializedItem(
  input: SerializedItemFormValues,
): Promise<SerializedItem> {
  const { data } = await apiClient.post<SerializedItem>('/api/serialized-items/', input);
  return data;
}
