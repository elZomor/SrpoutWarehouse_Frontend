import { apiClient } from '../../lib/apiClient';
import type { WorkOrderFormValues } from './schema';
import type { WorkOrder } from './types';

export async function listWorkOrders(): Promise<WorkOrder[]> {
  const { data } = await apiClient.get<WorkOrder[]>('/api/work-orders/');
  return data;
}

export async function createWorkOrder(input: WorkOrderFormValues): Promise<WorkOrder> {
  const { data } = await apiClient.post<WorkOrder>('/api/work-orders/', input);
  return data;
}
