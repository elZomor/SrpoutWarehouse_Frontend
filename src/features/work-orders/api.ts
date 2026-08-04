import { apiClient } from '../../lib/apiClient';
import type { ReturnItemFormValues, ScanItemFormValues, WorkOrderFormValues } from './schema';
import type {
  ActiveWorkOrder,
  ReturnWorkOrderBoxResponse,
  ScanWorkOrderBoxResponse,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderReturnResult,
} from './types';

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

export async function scanWorkOrderBox(
  workOrderId: number,
  boxCode: string,
): Promise<ScanWorkOrderBoxResponse> {
  const { data } = await apiClient.post<ScanWorkOrderBoxResponse>(
    `/api/work-orders/${workOrderId}/scan-box/`,
    { box_code: boxCode },
  );
  return data;
}

export async function completeWorkOrder(workOrderId: number): Promise<WorkOrder> {
  const { data } = await apiClient.post<WorkOrder>(`/api/work-orders/${workOrderId}/complete/`);
  return data;
}

export async function returnWorkOrderItem(
  workOrderId: number,
  input: ReturnItemFormValues,
): Promise<WorkOrderReturnResult> {
  const { data } = await apiClient.post<WorkOrderReturnResult>(
    `/api/work-orders/${workOrderId}/return-item/`,
    input,
  );
  return data;
}

export async function returnWorkOrderBox(
  workOrderId: number,
  boxCode: string,
): Promise<ReturnWorkOrderBoxResponse> {
  const { data } = await apiClient.post<ReturnWorkOrderBoxResponse>(
    `/api/work-orders/${workOrderId}/return-box/`,
    { box_code: boxCode },
  );
  return data;
}

export async function downloadWorkOrderPackingList(workOrderId: number): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/api/work-orders/${workOrderId}/packing-list/`, {
    responseType: 'blob',
  });
  return data;
}
