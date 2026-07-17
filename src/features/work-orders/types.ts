export type WorkOrderStatus = 'draft' | 'in_progress' | 'fulfilled';

export interface WorkOrderLineItem {
  id: number;
  product_type: number;
  product_type_name: string;
  quantity: number;
  scanned_quantity: number;
  remaining_quantity: number;
}

export interface WorkOrder {
  id: number;
  job_name: string;
  client_name: string;
  expected_date_out: string;
  status: WorkOrderStatus;
  created_by: number;
  created_by_username: string;
  line_items: WorkOrderLineItem[];
}
