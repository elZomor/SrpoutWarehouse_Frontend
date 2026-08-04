import { describe, expect, it } from 'vitest';
import { productTypeSchema } from './schema';

// Moved off ProductTypesPage.test.tsx ("requires a name before submitting",
// "requires a category before submitting") - pure zod validation, no DOM
// needed.
describe('productTypeSchema', () => {
  it('accepts a name and category with no model code or description', () => {
    const result = productTypeSchema.safeParse({ name: 'Bar LED Model A', category: 1 });
    expect(result.success).toBe(true);
  });

  it('requires a name', () => {
    const result = productTypeSchema.safeParse({ name: '', category: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['name'], message: 'productTypes.form.nameRequired' }),
      );
    }
  });

  it('requires a category', () => {
    const result = productTypeSchema.safeParse({ name: 'Bar LED Model A', category: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['category'],
          message: 'productTypes.form.categoryRequired',
        }),
      );
    }
  });
});
