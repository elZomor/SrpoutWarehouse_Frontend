import { describe, expect, it } from 'vitest';
import { serializedItemSchema } from './schema';

// Moved off SerializedItemsPage.test.tsx ("requires a serial number before
// submitting", "requires a product type before submitting") - pure zod
// validation, no DOM needed.
describe('serializedItemSchema', () => {
  it('accepts a serial number and product type', () => {
    const result = serializedItemSchema.safeParse({ serial_number: 'SN-042', product_type: 1 });
    expect(result.success).toBe(true);
  });

  it('requires a serial number', () => {
    const result = serializedItemSchema.safeParse({ serial_number: '', product_type: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['serial_number'],
          message: 'serializedItems.form.serialNumberRequired',
        }),
      );
    }
  });

  it('requires a product type', () => {
    const result = serializedItemSchema.safeParse({
      serial_number: 'SN-042',
      product_type: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['product_type'],
          message: 'serializedItems.form.productTypeRequired',
        }),
      );
    }
  });
});
