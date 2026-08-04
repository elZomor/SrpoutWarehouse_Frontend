import { describe, expect, it } from 'vitest';
import { classifyReceiveRejection, resolveReceiveFormReset } from './logic';
import type { PurchaseOrder } from './types';

// Moved off PurchaseOrdersPage.test.tsx (WRH-34) - "deselects a line item
// once it is fully received" and "shows an inline error for a duplicate
// serial number scan" were full page-mount tests standing in for what's
// pure logic. The over-cap/archived cases below had zero test coverage
// before this extraction, mount or otherwise - closing a real gap, not
// just relocating one.

function makePurchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 1,
    supplier_name: 'Acme Lighting Co',
    order_date: '2026-08-01',
    status: 'partially_received',
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        expected_quantity: 2,
        received_quantity: 1,
        remaining_quantity: 1,
      },
    ],
    ...overrides,
  };
}

describe('resolveReceiveFormReset', () => {
  it('keeps the same line item selected when it still has a remaining quantity', () => {
    expect(resolveReceiveFormReset(makePurchaseOrder(), 1)).toEqual({ line_item: 1 });
  });

  it('deselects a line item once it is fully received', () => {
    const fullyReceived = makePurchaseOrder({
      line_items: [
        {
          id: 1,
          product_type: 1,
          product_type_name: 'Bar LED Model A',
          expected_quantity: 2,
          received_quantity: 2,
          remaining_quantity: 0,
        },
      ],
    });
    expect(resolveReceiveFormReset(fullyReceived, 1)).toEqual({ line_item: undefined });
  });

  it('deselects when the submitted line item is no longer present', () => {
    expect(resolveReceiveFormReset(makePurchaseOrder(), 999)).toEqual({ line_item: undefined });
  });
});

describe('classifyReceiveRejection', () => {
  it('classifies a duplicate serial number', () => {
    expect(classifyReceiveRejection(['This serial is already registered.'], [])).toEqual({
      field: 'serial_number',
      messageKey: 'purchaseOrders.receive.duplicateSerialError',
    });
  });

  it('classifies an over-cap line item (already received its expected quantity)', () => {
    expect(
      classifyReceiveRejection([], ['This line item has already received its expected quantity.']),
    ).toEqual({ field: 'line_item', messageKey: 'purchaseOrders.receive.overCapError' });
  });

  it('classifies an archived line item', () => {
    expect(classifyReceiveRejection([], ['This line item has been archived.'])).toEqual({
      field: 'line_item',
      messageKey: 'purchaseOrders.receive.archivedError',
    });
  });

  it('returns null when nothing matches', () => {
    expect(classifyReceiveRejection([], [])).toBeNull();
  });
});
