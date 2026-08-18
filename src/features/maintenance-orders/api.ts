import { apiClient } from '../../lib/apiClient';
import type { MaintenanceOrderFormValues } from './schema';
import type { MaintenanceOrder, MaintenanceOrderResolution } from './types';

export async function listMaintenanceOrders(): Promise<MaintenanceOrder[]> {
  const { data } = await apiClient.get<MaintenanceOrder[]>('/api/maintenance-orders/');
  return data;
}

export async function createMaintenanceOrder(
  input: MaintenanceOrderFormValues,
): Promise<MaintenanceOrder> {
  const { data } = await apiClient.post<MaintenanceOrder>('/api/maintenance-orders/', input);
  return data;
}

// AC-1/AC-2/AC-3: resolves one line item; the backend's response is the
// MO's full, updated representation (other items' unchanged status plus
// the MO's own recomputed status), matching createMaintenanceOrder's
// identical "response is the new/updated resource" shape - though the
// current caller (useResolveMaintenanceOrderItem) discards it and instead
// invalidates the maintenance-orders query for a real refetch.
export async function resolveMaintenanceOrderItem(
  maintenanceOrderId: number,
  itemId: number,
  resolution: MaintenanceOrderResolution,
  note?: string,
): Promise<MaintenanceOrder> {
  const { data } = await apiClient.post<MaintenanceOrder>(
    `/api/maintenance-orders/${maintenanceOrderId}/resolve/`,
    { item_id: itemId, resolution, note },
  );
  return data;
}
