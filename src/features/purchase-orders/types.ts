export interface PurchaseOrderLineItem {
  id: number;
  product_type: number;
  product_type_name: string;
  expected_quantity: number;
}

export interface PurchaseOrder {
  id: number;
  supplier_name: string;
  order_date: string;
  status: string;
  line_items: PurchaseOrderLineItem[];
}
