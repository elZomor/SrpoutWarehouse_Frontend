import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { getAssignedProductTypeCount, isDuplicateNameError } from './logic';

// Moved off CategoriesPage.test.tsx (WRH-34) - full page-mount tests
// standing in for what's pure error-shape classification.

function makeAxiosError(data: unknown): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = { data, status: 400, statusText: '', headers: {}, config: {} as never };
  return error;
}

describe('isDuplicateNameError', () => {
  it('is true when the backend returns the duplicate-name message', () => {
    expect(
      isDuplicateNameError(makeAxiosError({ name: ['A category with this name already exists.'] })),
    ).toBe(true);
  });

  it('is false for a different name error (e.g. a blank/whitespace-only name)', () => {
    // Regression: must match the exact duplicate-name text, not just "any
    // name error", so an unrelated name validation failure isn't
    // mislabeled as a duplicate.
    expect(isDuplicateNameError(makeAxiosError({ name: ['This field may not be blank.'] }))).toBe(
      false,
    );
  });

  it('is false when there is no name error at all', () => {
    expect(isDuplicateNameError(makeAxiosError({}))).toBe(false);
  });

  it('is false for a non-axios error', () => {
    expect(isDuplicateNameError(new Error('boom'))).toBe(false);
  });
});

describe('getAssignedProductTypeCount', () => {
  it('extracts the assigned product type count', () => {
    expect(getAssignedProductTypeCount(makeAxiosError({ assigned_product_type_count: 3 }))).toBe(3);
  });

  it('returns undefined when the count is absent', () => {
    expect(getAssignedProductTypeCount(makeAxiosError({}))).toBeUndefined();
  });

  it('returns undefined for a non-axios error', () => {
    expect(getAssignedProductTypeCount(new Error('boom'))).toBeUndefined();
  });
});
