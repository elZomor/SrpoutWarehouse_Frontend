export type PurchaseOrderStatus = 'pending' | 'partially_received' | 'received';

export interface PurchaseOrderLineItem {
  id: number;
  product_type: number;
  product_type_name: string;
  expected_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
}

export interface PurchaseOrder {
  id: number;
  supplier_name: string;
  order_date: string;
  status: PurchaseOrderStatus;
  line_items: PurchaseOrderLineItem[];
}
