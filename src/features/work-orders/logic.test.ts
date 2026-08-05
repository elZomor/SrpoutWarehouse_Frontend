import { describe, expect, it } from 'vitest';
import {
  classifyReturnRejection,
  classifyScanRejection,
  classifyTransferRejection,
  flattenWorkOrderDetailRows,
  isFullyScanned,
  isPackingListEligible,
  isPrimaryWorkOrder,
  isReturnEligible,
  scannableLineItemOptions,
} from './logic';
import type {
  ActiveWorkOrder,
  ActiveWorkOrderSupplementary,
  WorkOrderDetailLineItem,
  WorkOrderLineItem,
} from './types';

// Moved off WorkOrdersPage.fulfillment/return/active.test.tsx (WRH-34) -
// these were full page-mount tests standing in for what's pure
// string/branch matching. Each case here mirrors the exact scenario the
// mount test it replaces set up.

describe('classifyScanRejection', () => {
  it('falls back to notAvailableError for an unclassified serial error (duplicate/unavailable scan)', () => {
    expect(classifyScanRejection(['This item is not available to scan.'], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.scan.notAvailableError',
    });
  });

  it('classifies "Serial not found"', () => {
    expect(classifyScanRejection(['Serial not found'], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.scan.notFoundError',
    });
  });

  it('classifies an already-out item and extracts the WO id', () => {
    expect(classifyScanRejection(['SN-042 is currently out on WO-17'], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.scan.outError',
      params: { workOrderId: '17' },
    });
  });

  it('classifies an already-reserved item and extracts the WO id', () => {
    expect(classifyScanRejection(['SN-043 is already reserved on WO-22'], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.scan.reservedError',
      params: { workOrderId: '22' },
    });
  });

  it('anchors the WO-id regex to the end of the message, not a WO-shaped serial number', () => {
    // Regression: an unanchored regex could grab "99" out of the serial
    // itself instead of the real "17" the backend appends last.
    expect(classifyScanRejection(['WO-99-BATT is currently out on WO-17'], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.scan.outError',
      params: { workOrderId: '17' },
    });
  });

  it("classifies a damaged item even when its serial embeds another reason's phrase", () => {
    expect(
      classifyScanRejection(['SN-is currently out on-77 is damaged and cannot be issued'], []),
    ).toEqual({ field: 'serial_number', messageKey: 'workOrders.scan.damagedError' });
  });

  it("doesn't misclassify an out item as a product-type mismatch when its serial embeds that phrase", () => {
    expect(
      classifyScanRejection(
        ["SN-does not match this line item's product type.-77 is currently out on WO-17"],
        [],
      ),
    ).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.scan.outError',
      params: { workOrderId: '17' },
    });
  });

  it('classifies a genuine product-type mismatch', () => {
    expect(
      classifyScanRejection(["Item does not match this line item's product type."], []),
    ).toEqual({ field: 'serial_number', messageKey: 'workOrders.scan.productTypeMismatchError' });
  });

  it('classifies a damaged item', () => {
    expect(classifyScanRejection(['SN-099 is damaged and cannot be issued'], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.scan.damagedError',
    });
  });

  it('classifies a missing item', () => {
    expect(classifyScanRejection(['SN-100 is missing and cannot be issued'], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.scan.missingError',
    });
  });

  it('classifies an over-cap line item error', () => {
    expect(
      classifyScanRejection([], ['This line item has already reached its requested quantity.']),
    ).toEqual({ field: 'line_item', messageKey: 'workOrders.scan.overCapError' });
  });

  it('returns null when nothing matches', () => {
    expect(classifyScanRejection([], [])).toBeNull();
  });
});

describe('classifyReturnRejection', () => {
  it('classifies "Serial not found"', () => {
    expect(classifyReturnRejection(['Serial not found'], [])).toEqual({
      messageKey: 'workOrders.return.notFoundError',
    });
  });

  it('classifies a not-issued-on-this-WO item and extracts the WO id', () => {
    expect(classifyReturnRejection(['SN-042 was not issued on WO-17'], [])).toEqual({
      messageKey: 'workOrders.return.notIssuedError',
      params: { workOrderId: '17' },
    });
  });

  it('classifies an item that is not currently out', () => {
    expect(classifyReturnRejection(['SN-055 is not currently out on this work order'], [])).toEqual(
      { messageKey: 'workOrders.return.notOutError' },
    );
  });

  it('classifies a status error', () => {
    expect(classifyReturnRejection([], ['Cannot return an item on a draft work order.'])).toEqual({
      messageKey: 'workOrders.return.statusError',
    });
  });

  it('returns null when nothing matches', () => {
    expect(classifyReturnRejection([], [])).toBeNull();
  });
});

describe('classifyTransferRejection', () => {
  it('classifies "Serial not found"', () => {
    expect(classifyTransferRejection(['Serial not found'], [], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.transfer.notFoundError',
    });
  });

  it('classifies an item not currently out on the source WO and extracts the WO id', () => {
    expect(classifyTransferRejection(['SN-042 is not currently out on WO-17'], [], [])).toEqual({
      field: 'serial_number',
      messageKey: 'workOrders.transfer.notOnSourceError',
      params: { workOrderId: '17' },
    });
  });

  it('classifies an item that is not currently out at all', () => {
    expect(
      classifyTransferRejection(['SN-055 is not currently out and cannot be transferred'], [], []),
    ).toEqual({ field: 'serial_number', messageKey: 'workOrders.transfer.notOutError' });
  });

  it('classifies a same-work-order destination error', () => {
    expect(classifyTransferRejection([], [], ['Item is already on this work order.'])).toEqual({
      field: 'destination_work_order',
      messageKey: 'workOrders.transfer.sameWorkOrderError',
    });
  });

  it('classifies a status error', () => {
    expect(classifyTransferRejection([], ['Work order is not eligible for transfer.'], [])).toEqual(
      { field: 'serial_number', messageKey: 'workOrders.transfer.statusError' },
    );
  });

  it('returns null when nothing matches', () => {
    expect(classifyTransferRejection([], [], [])).toBeNull();
  });
});

describe('isReturnEligible', () => {
  it('is eligible for a fulfilled WO', () => {
    expect(isReturnEligible('fulfilled')).toBe(true);
  });

  it('is eligible for a partially_returned WO (AC-4: completing it later)', () => {
    expect(isReturnEligible('partially_returned')).toBe(true);
  });

  it('is not eligible for a draft WO', () => {
    expect(isReturnEligible('draft')).toBe(false);
  });

  it('is not eligible for an in_progress WO', () => {
    expect(isReturnEligible('in_progress')).toBe(false);
  });
});

function makePrimary(overrides: Partial<ActiveWorkOrder> = {}): ActiveWorkOrder {
  return {
    id: 1,
    reference: 'WO-1',
    job_name: 'Summer Gala',
    client_name: 'Acme Events',
    expected_date_out: '2026-08-01',
    status: 'fulfilled',
    line_items: [],
    supplementaries: [],
    ...overrides,
  };
}

function makeSupplementary(
  overrides: Partial<ActiveWorkOrderSupplementary> = {},
): ActiveWorkOrderSupplementary {
  return {
    id: 2,
    reference: 'WO-1-S1',
    job_name: 'Existing Supplementary',
    client_name: 'Acme Events',
    expected_date_out: '2026-08-01',
    status: 'fulfilled',
    line_items: [],
    ...overrides,
  };
}

describe('isPrimaryWorkOrder', () => {
  it('is true for a Primary work order', () => {
    expect(isPrimaryWorkOrder(makePrimary())).toBe(true);
  });

  it('is false for a nested supplementary', () => {
    expect(isPrimaryWorkOrder(makeSupplementary())).toBe(false);
  });
});

describe('isPackingListEligible', () => {
  it('is eligible for a Primary WO once fulfillment has started', () => {
    expect(isPackingListEligible(makePrimary({ status: 'in_progress' }))).toBe(true);
  });

  it('is not eligible for a draft Primary WO', () => {
    expect(isPackingListEligible(makePrimary({ status: 'draft' }))).toBe(false);
  });

  it('is eligible for a nested supplementary once fulfillment has started', () => {
    expect(isPackingListEligible(makeSupplementary({ status: 'fulfilled' }))).toBe(true);
  });

  it('is not eligible for a draft nested supplementary', () => {
    expect(isPackingListEligible(makeSupplementary({ status: 'draft' }))).toBe(false);
  });
});

describe('isFullyScanned', () => {
  const lineItem: WorkOrderLineItem = {
    id: 1,
    product_type: 1,
    product_type_name: 'Bar LED Model A',
    quantity: 1,
    scanned_quantity: 0,
    remaining_quantity: 0,
  };

  it('is true when every line item has nothing remaining', () => {
    expect(isFullyScanned([lineItem])).toBe(true);
  });

  it('is false when a line item still has a remaining quantity', () => {
    expect(isFullyScanned([{ ...lineItem, remaining_quantity: 1 }])).toBe(false);
  });

  it('is true for an empty list', () => {
    expect(isFullyScanned([])).toBe(true);
  });
});

describe('scannableLineItemOptions', () => {
  it('excludes line items with nothing remaining and maps the rest to Select options', () => {
    const lineItems: WorkOrderLineItem[] = [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        quantity: 3,
        scanned_quantity: 3,
        remaining_quantity: 0,
      },
      {
        id: 2,
        product_type: 2,
        product_type_name: 'Fog Machine',
        quantity: 2,
        scanned_quantity: 1,
        remaining_quantity: 1,
      },
    ];
    expect(scannableLineItemOptions(lineItems)).toEqual([{ value: 2, label: 'Fog Machine' }]);
  });
});

describe('flattenWorkOrderDetailRows', () => {
  it("flattens each line item's serialized items into one row per serial", () => {
    const lineItems: WorkOrderDetailLineItem[] = [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        quantity: 1,
        serialized_items: [{ id: 1, serial_number: 'SN-0001', status: 'out' }],
      },
    ];
    expect(flattenWorkOrderDetailRows(lineItems)).toEqual([
      { key: 1, product_type_name: 'Bar LED Model A', serial_number: 'SN-0001', status: 'out' },
    ]);
  });
});
