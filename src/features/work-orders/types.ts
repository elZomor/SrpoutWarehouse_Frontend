export type WorkOrderStatus =
  'draft' | 'in_progress' | 'fulfilled' | 'returned' | 'partially_returned';

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
  // WRH-53/AC-1/AC-2: the display identifier - "WO-<id>" for a Primary,
  // "WO-<primary id>-S<n>" for a supplementary - computed server-side, see
  // the backend's _work_order_reference().
  reference: string;
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
  // WRH-57/AC-2/AC-3: its own category, excluded from still_out_quantity -
  // a damaged item counts neither as still missing nor as returned.
  damaged_quantity: number;
  still_out_quantity: number;
}

export interface ActiveWorkOrderSupplementary {
  id: number;
  reference: string;
  job_name: string;
  client_name: string;
  expected_date_out: string;
  status: WorkOrderStatus;
  line_items: ActiveWorkOrderLineItem[];
}

export interface ActiveWorkOrder {
  id: number;
  reference: string;
  job_name: string;
  client_name: string;
  expected_date_out: string;
  status: WorkOrderStatus;
  line_items: ActiveWorkOrderLineItem[];
  supplementaries: ActiveWorkOrderSupplementary[];
}

// WRH-38: return_item()'s response - same per-line-item returned/still-out
// shape as ActiveWorkOrderLineItem (WRH-55), now populated for real once a
// return session starts flipping items back to available.
export interface WorkOrderReturnResult {
  id: number;
  job_name: string;
  status: WorkOrderStatus;
  line_items: ActiveWorkOrderLineItem[];
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
  reference: string;
  job_name: string;
  client_name: string;
  expected_date_out: string;
  status: WorkOrderStatus;
  created_by: number;
  created_by_username: string;
  parent_work_order: number | null;
  line_items: WorkOrderDetailLineItem[];
}
