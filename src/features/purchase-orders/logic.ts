import type { PurchaseOrder } from './types';

// Extracted out of PurchaseOrdersPage.tsx (WRH-34 test-suite rework) -
// these were inline closures in onReceiveSubmit, unit-tested only by
// mounting the whole page. See logic.test.ts.

// Keep the same line item selected - a scan gun typically fires many scans
// against the same line item in a row. But if that scan just completed the
// line item, it's no longer a valid option in receivableLineItemOptions -
// keeping it selected would leave the Select showing no matching option
// while still silently submitting against the now-exhausted line item on
// the next scan. Reads the freshly returned PurchaseOrder (not any locally
// cached copy, which hasn't re-rendered with this response yet) to decide.
export function resolveReceiveFormReset(
  updatedPurchaseOrder: PurchaseOrder,
  submittedLineItemId: number | undefined,
): { line_item: number | undefined } {
  const scannedLineItem = updatedPurchaseOrder.line_items.find(
    (item) => item.id === submittedLineItemId,
  );
  return {
    line_item:
      scannedLineItem && scannedLineItem.remaining_quantity > 0 ? submittedLineItemId : undefined,
  };
}

export interface ReceiveRejection {
  field: 'serial_number' | 'line_item';
  messageKey: string;
}

// Mirrors onReceiveSubmit's old onError callback exactly - first-match-wins,
// same branch order as before.
export function classifyReceiveRejection(
  serialErrors: string[],
  lineItemErrors: string[],
): ReceiveRejection | null {
  if (serialErrors.some((message) => message.includes('already registered'))) {
    return { field: 'serial_number', messageKey: 'purchaseOrders.receive.duplicateSerialError' };
  }
  if (
    lineItemErrors.some((message) => message.includes('already received its expected quantity'))
  ) {
    return { field: 'line_item', messageKey: 'purchaseOrders.receive.overCapError' };
  }
  if (lineItemErrors.some((message) => message.includes('archived'))) {
    return { field: 'line_item', messageKey: 'purchaseOrders.receive.archivedError' };
  }
  return null;
}
