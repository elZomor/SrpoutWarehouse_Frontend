import { apiClient } from '../../lib/apiClient';
import { env } from '../../config/env';
import type { BoxFormValues } from './schema';
import type { Box } from './types';

export async function listBoxes(): Promise<Box[]> {
  const { data } = await apiClient.get<Box[]>('/api/boxes/');
  return data;
}

export async function createBox(input: BoxFormValues): Promise<Box> {
  const { data } = await apiClient.post<Box>('/api/boxes/', input);
  return data;
}

// WRH-71/AC-1/AC-5: fetched fresh on demand when a box row is clicked,
// rather than reusing the list row's own `items` - the list response can go
// stale between fetches, and the detail view needs the currently-assigned
// items at click time.
export async function getBox(id: number): Promise<Box> {
  const { data } = await apiClient.get<Box>(`/api/boxes/${id}/`);
  return data;
}

// The QR code is generated on demand rather than stored (see Box's backend
// model comment) - matches getSerializedItemQrCodeUrl's identical plain-URL
// shape so it can be embedded directly as an <img src>.
export function getBoxQrCodeUrl(id: number): string {
  return `${env.VITE_API_BASE_URL}/api/boxes/${id}/qr-code/`;
}
