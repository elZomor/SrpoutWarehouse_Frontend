// WRH-75: the single source of truth for every status this model can carry
// - WorkOrderStatus is derived FROM this array (not the other way round) so
// a new status can't be added to one without the other, unlike a
// hand-written union type + a separately hand-written array of its values
// (e.g. a status-column filter's options) that can silently drift apart.
export const WORK_ORDER_STATUSES = [
  'draft',
  'in_progress',
  'fulfilled',
  'partially_returned',
  'returned',
  'closed',
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

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
// return session starts flipping items back to available. WRH-80/AC-3: also
// shared by close() - a return initiated on a Primary now consolidates every
// supplementary into this same response, one entry per supplementary with
// its own fresh status/counts (same shape the active list already nests).
export interface WorkOrderReturnResult {
  id: number;
  job_name: string;
  status: WorkOrderStatus;
  line_items: ActiveWorkOrderLineItem[];
  supplementaries: ActiveWorkOrderSupplementary[];
}

// WRH-26/AC-2/AC-3: one entry per item inside a scanned box, each validated
// individually - "added" mirrors whether that specific item was claimed/
// returned, "reason" is a human-readable rejection message when it wasn't.
export interface BoxScanResultItem {
  serial_number: string;
  added: boolean;
  reason: string;
}

export interface BoxScanSummary {
  code: string;
  added: number;
  results: BoxScanResultItem[];
}

export interface ScanWorkOrderBoxResponse {
  work_order: WorkOrder;
  box_summary: BoxScanSummary;
}

export interface ReturnWorkOrderBoxResponse {
  work_order: WorkOrderReturnResult;
  box_summary: BoxScanSummary;
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

// WRH-40/AC-1/AC-2: close()'s response - same WorkOrderReturnResult shape as
// return_item()/return_box() for the WO/line-item side, plus missing_count
// (how many remaining out items this call swept to Missing) since that
// number isn't otherwise derivable from the still_out_quantity breakdown
// alone (still_out_quantity deliberately keeps counting a missing item as
// "still out", matching the Active list's existing intent that an
// unaccounted-for item shouldn't vanish from the summary).
export interface WorkOrderCloseResponse {
  work_order: WorkOrderReturnResult;
  missing_count: number;
}

// WRH-36/AC-1: transfer()'s response - a flat confirmation, not a WorkOrder/
// ActiveWorkOrder shape, since neither WO's own status/line items change
// (see the backend's transfer() comment on why work_order_line_item is left
// untouched).
export interface WorkOrderTransferResult {
  serial_number: string;
  status: SerializedItemStatus;
  source_work_order: string;
  destination_work_order: string;
}
