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

// AC-1/AC-2/AC-3: resolves one line item and returns the MO's full,
// updated representation (including the other items' unchanged status and
// the MO's own recomputed status) - the page uses this directly instead of
// re-fetching the list, matching createMaintenanceOrder's identical
// "response is the new/updated resource" shape.
export async function resolveMaintenanceOrderItem(
  maintenanceOrderId: number,
  itemId: number,
  resolution: MaintenanceOrderResolution,
): Promise<MaintenanceOrder> {
  const { data } = await apiClient.post<MaintenanceOrder>(
    `/api/maintenance-orders/${maintenanceOrderId}/resolve/`,
    { item_id: itemId, resolution },
  );
  return data;
}
