import { apiClient } from '../../lib/apiClient';
import { env } from '../../config/env';
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

export async function deleteSerializedItem(id: number): Promise<void> {
  await apiClient.delete(`/api/serialized-items/${id}/`);
}

// The QR code is generated on demand rather than stored (see SerializedItem's
// backend model comment) - this is a plain URL, not an api.ts call, since the
// Print QR link navigates the browser there directly instead of fetching it
// through axios.
export function getSerializedItemQrCodeUrl(id: number): string {
  return `${env.VITE_API_BASE_URL}/api/serialized-items/${id}/qr-code/`;
}
