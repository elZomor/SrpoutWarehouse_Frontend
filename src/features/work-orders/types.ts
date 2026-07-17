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

export interface ActiveWorkOrderLineItem {
  id: number;
  product_type: number;
  product_type_name: string;
  quantity: number;
  returned_quantity: number;
  still_out_quantity: number;
}

export interface ActiveWorkOrderSupplementary {
  id: number;
  job_name: string;
  client_name: string;
  expected_date_out: string;
  status: WorkOrderStatus;
  line_items: ActiveWorkOrderLineItem[];
}

export interface ActiveWorkOrder {
  id: number;
  job_name: string;
  client_name: string;
  expected_date_out: string;
  status: WorkOrderStatus;
  line_items: ActiveWorkOrderLineItem[];
  supplementaries: ActiveWorkOrderSupplementary[];
}

export type SerializedItemStatus = 'available' | 'reserved' | 'out';

export interface WorkOrderDetailSerializedItem {
  id: number;
  serial_number: string;
  status: SerializedItemStatus;
}

export interface WorkOrderDetailLineItem {
  id: number;
  product_type: number;
  product_type_name: string;
  quantity: number;
  serialized_items: WorkOrderDetailSerializedItem[];
}

export interface WorkOrderDetail {
  id: number;
  job_name: string;
  client_name: string;
  expected_date_out: string;
  status: WorkOrderStatus;
  created_by: number;
  created_by_username: string;
  parent_work_order: number | null;
  line_items: WorkOrderDetailLineItem[];
}
