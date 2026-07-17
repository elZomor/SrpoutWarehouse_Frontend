import { apiClient } from '../../lib/apiClient';
import type { ScanItemFormValues, WorkOrderFormValues } from './schema';
import type { ActiveWorkOrder, WorkOrder, WorkOrderDetail } from './types';

export async function listWorkOrders(): Promise<WorkOrder[]> {
  const { data } = await apiClient.get<WorkOrder[]>('/api/work-orders/');
  return data;
}

export async function listActiveWorkOrders(): Promise<ActiveWorkOrder[]> {
  const { data } = await apiClient.get<ActiveWorkOrder[]>('/api/work-orders/active/');
  return data;
}

export async function getWorkOrder(workOrderId: number): Promise<WorkOrderDetail> {
  const { data } = await apiClient.get<WorkOrderDetail>(`/api/work-orders/${workOrderId}/`);
  return data;
}

export async function createWorkOrder(input: WorkOrderFormValues): Promise<WorkOrder> {
  const { data } = await apiClient.post<WorkOrder>('/api/work-orders/', input);
  return data;
}

export async function startWorkOrder(workOrderId: number): Promise<WorkOrder> {
  const { data } = await apiClient.post<WorkOrder>(`/api/work-orders/${workOrderId}/start/`);
  return data;
}

export async function scanWorkOrderItem(
  workOrderId: number,
  input: ScanItemFormValues,
): Promise<WorkOrder> {
  const { data } = await apiClient.post<WorkOrder>(`/api/work-orders/${workOrderId}/scan/`, input);
  return data;
}

export async function completeWorkOrder(workOrderId: number): Promise<WorkOrder> {
  const { data } = await apiClient.post<WorkOrder>(`/api/work-orders/${workOrderId}/complete/`);
  return data;
}
