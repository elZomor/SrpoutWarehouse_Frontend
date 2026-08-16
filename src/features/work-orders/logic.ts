import type {
  ActiveWorkOrder,
  ActiveWorkOrderLineItem,
  ActiveWorkOrderSupplementary,
  WorkOrderDetailLineItem,
  WorkOrderLineItem,
  WorkOrderStatus,
} from './types';

// Extracted out of WorkOrdersPage.tsx (WRH-34 test-suite rework) - these
// were anonymous inline closures/consts in the component, unit-tested only
// by mounting the whole page. See logic.test.ts for the fast unit tests
// these now feed.

// WRH-33: scan()'s serial_number rejection messages are always
// `${serial_number} ${reason}` - and serial_number is unconstrained free
// text (backend SerializedItem.serial_number has no format restriction),
// so every one of these has to be matched against the message's actual
// *end*, not just checked with .includes() anywhere in the string. A serial
// number that happens to contain another reason's phrase (e.g.
// "SN is currently out on WO-5" scanned while genuinely damaged) would
// otherwise misclassify: the backend always appends its real reason last,
// so anchoring to $ is what makes the true reason unambiguous regardless of
// what's in the serial itself.
export const OUT_PATTERN = /is currently out on WO-(\d+)$/;
export const RESERVED_PATTERN = /is already reserved on WO-(\d+)$/;
export const DAMAGED_PATTERN = /is damaged and cannot be issued$/;
export const MISSING_PATTERN = /is missing and cannot be issued$/;
// WRH-38: return_item()'s serial_number rejections follow the same
// `${serial_number} ${reason}` shape as scan()'s - anchored to the
// message's end for the same reason as the OUT/RESERVED/DAMAGED/MISSING
// patterns above.
export const NOT_ISSUED_PATTERN = /was not issued on WO-(\d+)$/;
export const NOT_OUT_PATTERN = /is not currently out on this work order$/;
export const RETURN_ELIGIBLE_STATUSES = new Set<WorkOrderStatus>([
  'fulfilled',
  'partially_returned',
]);
// WRH-36: transfer()'s serial_number rejections follow the same
// `${serial_number} ${reason}` shape as scan()'s/return_item()'s - same
// end-anchoring reasoning as OUT_PATTERN/NOT_ISSUED_PATTERN above. Distinct
// wording from NOT_ISSUED_PATTERN ("is not currently out on WO-<id>" vs.
// "was not issued on WO-<id>") since it's a different backend action/
// message, not reusable as-is.
export const NOT_ON_SOURCE_WORK_ORDER_PATTERN = /is not currently out on WO-(\d+)$/;
export const NOT_OUT_FOR_TRANSFER_PATTERN = /is not currently out and cannot be transferred$/;
// WRH-37/AC-4: a fixed constant with no free text in it (destination_work_order
// is an id, not user-entered text), so exact equality is enough - same
// reasoning as the fixed-constant checks in classifyScanRejection.
const CLOSED_DESTINATION_MESSAGE = 'Destination work order is closed and cannot receive transfers.';

export interface ScanRejection {
  field: 'serial_number' | 'line_item';
  messageKey: string;
  params?: { workOrderId?: string };
}

// Mirrors onScanSubmit's old onError callback exactly - first-match-wins,
// same branch order as before (changing the order would be a real behavior
// change, not just a refactor). Returns null when no branch fires (the
// scan mutation errored but neither serialErrors nor lineItemErrors match
// anything classifiable - same silent fall-through the inline version had).
export function classifyScanRejection(
  serialErrors: string[],
  lineItemErrors: string[],
): ScanRejection | null {
  // AC-4/AC-2: both are fixed constants with no serial_number in them,
  // unlike the four dynamic messages below - checked by exact equality
  // (not .includes()) so a *different* rejection whose free-text
  // serial_number happens to contain one of these phrases can't be
  // swallowed by an earlier, looser check.
  if (serialErrors.some((message) => message === 'Serial not found')) {
    return { field: 'serial_number', messageKey: 'workOrders.scan.notFoundError' };
  }
  if (
    serialErrors.some((message) => message === "Item does not match this line item's product type.")
  ) {
    return { field: 'serial_number', messageKey: 'workOrders.scan.productTypeMismatchError' };
  }
  // AC-1: item already out on another WO - name that WO.
  const outMatch = serialErrors.map((message) => message.match(OUT_PATTERN)).find(Boolean);
  if (outMatch) {
    return {
      field: 'serial_number',
      messageKey: 'workOrders.scan.outError',
      params: { workOrderId: outMatch[1] },
    };
  }
  // Same WO reference as above, but for a scan-in-progress double-tap (item
  // already claimed, not yet confirmed out) rather than a fully fulfilled WO.
  const reservedMatch = serialErrors
    .map((message) => message.match(RESERVED_PATTERN))
    .find(Boolean);
  if (reservedMatch) {
    return {
      field: 'serial_number',
      messageKey: 'workOrders.scan.reservedError',
      params: { workOrderId: reservedMatch[1] },
    };
  }
  // AC-3: damaged/missing items.
  if (serialErrors.some((message) => DAMAGED_PATTERN.test(message))) {
    return { field: 'serial_number', messageKey: 'workOrders.scan.damagedError' };
  }
  if (serialErrors.some((message) => MISSING_PATTERN.test(message))) {
    return { field: 'serial_number', messageKey: 'workOrders.scan.missingError' };
  }
  if (serialErrors.length > 0) {
    return { field: 'serial_number', messageKey: 'workOrders.scan.notAvailableError' };
  }
  if (lineItemErrors.some((message) => message.includes('already reached'))) {
    return { field: 'line_item', messageKey: 'workOrders.scan.overCapError' };
  }
  return null;
}

export interface ReturnRejection {
  messageKey: string;
  params?: { workOrderId?: string };
}

// Mirrors the pendingReturnSubmission effect's old .catch classifier
// exactly - same first-match-wins order as classifyScanRejection above.
export function classifyReturnRejection(
  serialErrors: string[],
  statusErrors: string[],
): ReturnRejection | null {
  if (serialErrors.some((message) => message === 'Serial not found')) {
    return { messageKey: 'workOrders.return.notFoundError' };
  }
  const notIssuedMatch = serialErrors
    .map((message) => message.match(NOT_ISSUED_PATTERN))
    .find(Boolean);
  if (notIssuedMatch) {
    return {
      messageKey: 'workOrders.return.notIssuedError',
      params: { workOrderId: notIssuedMatch[1] },
    };
  }
  if (serialErrors.some((message) => NOT_OUT_PATTERN.test(message))) {
    return { messageKey: 'workOrders.return.notOutError' };
  }
  if (statusErrors.length > 0) {
    return { messageKey: 'workOrders.return.statusError' };
  }
  return null;
}

export function isReturnEligible(status: WorkOrderStatus): boolean {
  return RETURN_ELIGIBLE_STATUSES.has(status);
}

// WRH-69: mirrors the backend's _TERMINAL_STATUSES - a terminal Primary can
// now still appear on the Active tab (kept visible purely to nest a
// still-active Supplementary), so the row needs its own "done, read-only"
// visual treatment distinct from every other Active-tab row, which was
// never possible before this ticket since a terminal WO never reached the
// Active tab at all.
export const TERMINAL_STATUSES = new Set<WorkOrderStatus>(['returned', 'closed']);

export function isTerminalWorkOrder(status: WorkOrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// WRH-40/AC-1: the close-confirmation warning's "N items are still out"
// count - summed client-side from data the Active tab already has
// (ActiveWorkOrderLineItem.still_out_quantity), no separate preview
// endpoint needed since close() itself is a single one-shot POST, not a
// two-step API flow.
export function stillOutCount(lineItems: ActiveWorkOrderLineItem[]): number {
  return lineItems.reduce((total, lineItem) => total + lineItem.still_out_quantity, 0);
}

export interface TransferRejection {
  field: 'serial_number' | 'destination_work_order' | 'destination_line_item';
  messageKey: string;
  params?: { workOrderId?: string };
}

// WRH-68: fixed constants (no free text in either), same exact-equality
// reasoning as CLOSED_DESTINATION_MESSAGE above.
const DESTINATION_LINE_ITEM_WRONG_WORK_ORDER_MESSAGE =
  'Destination line item does not belong to the destination work order.';
const DESTINATION_LINE_ITEM_PRODUCT_TYPE_MISMATCH_MESSAGE =
  "Destination line item's product type does not match the transferred item.";

// WRH-36: mirrors classifyReturnRejection's first-match-wins shape.
// statusErrors (the source WO's own eligibility, {"status": [...]}) has no
// dedicated form field in the transfer modal, same as classifyReturnRejection
// - it's surfaced on serial_number too.
export function classifyTransferRejection(
  serialErrors: string[],
  statusErrors: string[],
  destinationErrors: string[],
  destinationLineItemErrors: string[] = [],
): TransferRejection | null {
  if (serialErrors.some((message) => message === 'Serial not found')) {
    return { field: 'serial_number', messageKey: 'workOrders.transfer.notFoundError' };
  }
  const notOnSourceMatch = serialErrors
    .map((message) => message.match(NOT_ON_SOURCE_WORK_ORDER_PATTERN))
    .find(Boolean);
  if (notOnSourceMatch) {
    return {
      field: 'serial_number',
      messageKey: 'workOrders.transfer.notOnSourceError',
      params: { workOrderId: notOnSourceMatch[1] },
    };
  }
  if (serialErrors.some((message) => NOT_OUT_FOR_TRANSFER_PATTERN.test(message))) {
    return { field: 'serial_number', messageKey: 'workOrders.transfer.notOutError' };
  }
  if (destinationErrors.some((message) => message === CLOSED_DESTINATION_MESSAGE)) {
    return {
      field: 'destination_work_order',
      messageKey: 'workOrders.transfer.closedDestinationError',
    };
  }
  if (destinationErrors.length > 0) {
    return {
      field: 'destination_work_order',
      messageKey: 'workOrders.transfer.sameWorkOrderError',
    };
  }
  if (
    destinationLineItemErrors.some(
      (message) => message === DESTINATION_LINE_ITEM_WRONG_WORK_ORDER_MESSAGE,
    )
  ) {
    return {
      field: 'destination_line_item',
      messageKey: 'workOrders.transfer.destinationLineItemWrongWorkOrderError',
    };
  }
  if (
    destinationLineItemErrors.some(
      (message) => message === DESTINATION_LINE_ITEM_PRODUCT_TYPE_MISMATCH_MESSAGE,
    )
  ) {
    return {
      field: 'destination_line_item',
      messageKey: 'workOrders.transfer.destinationLineItemProductTypeMismatchError',
    };
  }
  if (destinationLineItemErrors.some((message) => message.includes('already reached'))) {
    return {
      field: 'destination_line_item',
      messageKey: 'workOrders.transfer.destinationLineItemOverCapError',
    };
  }
  if (statusErrors.length > 0) {
    return { field: 'serial_number', messageKey: 'workOrders.transfer.statusError' };
  }
  return null;
}

// WRH-53/AC-1/AC-2: only a Primary can be a supplementary's parent (see the
// backend's parent_work_order queryset restriction) - `supplementaries`
// only exists on ActiveWorkOrder, never on ActiveWorkOrderSupplementary.
export function isPrimaryWorkOrder(
  record: ActiveWorkOrder | ActiveWorkOrderSupplementary,
): record is ActiveWorkOrder {
  return 'supplementaries' in record;
}

// WRH-34/AC-1: "not draft" gate, matching the backend's "in_progress or
// later" availability rule - every non-draft status (including WRH-40's
// "closed") satisfies this already, no change needed here for it. WRH-35/
// AC-2: no longer Primary-only - the backend now
// resolves a supplementary's own request to its Primary's consolidated
// document instead of rejecting it, so the button is offered on
// supplementary rows too.
export function isPackingListEligible(
  record: ActiveWorkOrder | ActiveWorkOrderSupplementary,
): boolean {
  return record.status !== 'draft';
}

export function isFullyScanned(lineItems: WorkOrderLineItem[]): boolean {
  return lineItems.every((item) => item.remaining_quantity <= 0);
}

export function scannableLineItemOptions(
  lineItems: WorkOrderLineItem[],
): { value: number; label: string }[] {
  return lineItems
    .filter((item) => item.remaining_quantity > 0)
    .map((item) => ({ value: item.id, label: item.product_type_name }));
}

export interface WorkOrderDetailRow {
  key: number;
  product_type_name: string;
  serial_number: string;
  status: string;
}

export function flattenWorkOrderDetailRows(
  lineItems: WorkOrderDetailLineItem[],
): WorkOrderDetailRow[] {
  return lineItems.flatMap((lineItem) =>
    lineItem.serialized_items.map((item) => ({
      key: item.id,
      product_type_name: lineItem.product_type_name,
      serial_number: item.serial_number,
      status: item.status,
    })),
  );
}
