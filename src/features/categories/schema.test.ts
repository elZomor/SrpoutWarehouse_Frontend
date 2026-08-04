import { describe, expect, it } from 'vitest';
import { categorySchema } from './schema';

// Moved off CategoriesPage.test.tsx ("requires a name before submitting") -
// pure zod validation, no DOM needed.
describe('categorySchema', () => {
  it('accepts a name with no description', () => {
    const result = categorySchema.safeParse({ name: 'Lighting' });
    expect(result.success).toBe(true);
  });

  it('requires a name', () => {
    const result = categorySchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['name'], message: 'categories.form.nameRequired' }),
      );
    }
  });
});
