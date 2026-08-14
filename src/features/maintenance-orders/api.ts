import { apiClient } from '../../lib/apiClient';
import type { MaintenanceOrderFormValues } from './schema';
import type { MaintenanceOrder } from './types';

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
