import { describe, expect, it } from 'vitest';
import { purchaseOrderSchema } from './schema';

// Moved off PurchaseOrdersPage.test.tsx ("requires a supplier name before
// submitting", "requires an order date before submitting", "requires a
// product type and quantity on the line item before submitting") - pure zod
// validation, no DOM needed.
describe('purchaseOrderSchema', () => {
  const validLineItem = { product_type: 1, expected_quantity: 5 };

  it('accepts a supplier, order date, and one valid line item', () => {
    const result = purchaseOrderSchema.safeParse({
      supplier_name: 'Acme Lighting Co',
      order_date: '2026-08-01',
      line_items: [validLineItem],
    });
    expect(result.success).toBe(true);
  });

  it('requires a supplier name', () => {
    const result = purchaseOrderSchema.safeParse({
      supplier_name: '',
      order_date: '2026-08-01',
      line_items: [validLineItem],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['supplier_name'],
          message: 'purchaseOrders.form.supplierNameRequired',
        }),
      );
    }
  });

  it('requires an order date', () => {
    const result = purchaseOrderSchema.safeParse({
      supplier_name: 'Acme Lighting Co',
      order_date: '',
      line_items: [validLineItem],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['order_date'],
          message: 'purchaseOrders.form.orderDateRequired',
        }),
      );
    }
  });

  it('requires a product type on the line item', () => {
    const result = purchaseOrderSchema.safeParse({
      supplier_name: 'Acme Lighting Co',
      order_date: '2026-08-01',
      line_items: [{ product_type: undefined, expected_quantity: 5 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['line_items', 0, 'product_type'],
          message: 'purchaseOrders.form.productTypeRequired',
        }),
      );
    }
  });

  it('requires a quantity of at least 1 on the line item', () => {
    const result = purchaseOrderSchema.safeParse({
      supplier_name: 'Acme Lighting Co',
      order_date: '2026-08-01',
      line_items: [{ product_type: 1, expected_quantity: 0 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['line_items', 0, 'expected_quantity'],
          message: 'purchaseOrders.form.expectedQuantityRequired',
        }),
      );
    }
  });
});
