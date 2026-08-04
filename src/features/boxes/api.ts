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

// The QR code is generated on demand rather than stored (see Box's backend
// model comment) - matches getSerializedItemQrCodeUrl's identical plain-URL
// shape so it can be embedded directly as an <img src>.
export function getBoxQrCodeUrl(id: number): string {
  return `${env.VITE_API_BASE_URL}/api/boxes/${id}/qr-code/`;
}
