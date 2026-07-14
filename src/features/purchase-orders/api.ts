import { apiClient } from '../../lib/apiClient';
import type { PurchaseOrderFormValues } from './schema';
import type { PurchaseOrder } from './types';

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data } = await apiClient.get<PurchaseOrder[]>('/api/purchase-orders/');
  return data;
}

export async function createPurchaseOrder(input: PurchaseOrderFormValues): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>('/api/purchase-orders/', input);
  return data;
}
