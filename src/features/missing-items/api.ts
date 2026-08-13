import { apiClient } from '../../lib/apiClient';
import type { SerializedItem } from '../serialized-items/types';
import type { MissingItem } from './types';

export async function listMissingItems(): Promise<MissingItem[]> {
  const { data } = await apiClient.get<MissingItem[]>('/api/missing-items/');
  return data;
}

// Both resolution actions return the updated SerializedItem representation
// (see the backend's MissingItemViewSet._resolve()) - the page doesn't use
// the response body directly (it just invalidates the list), but the type
// matches what the endpoint actually sends back.
export async function markMissingItemFound(id: number): Promise<SerializedItem> {
  const { data } = await apiClient.post<SerializedItem>(`/api/missing-items/${id}/mark-found/`);
  return data;
}

export async function writeOffMissingItem(id: number): Promise<SerializedItem> {
  const { data } = await apiClient.post<SerializedItem>(`/api/missing-items/${id}/write-off/`);
  return data;
}
