import axios from 'axios';

// Extracted out of CategoriesPage.tsx (WRH-34 test-suite rework) - these
// were inline error-classification closures in the component, unit-tested
// only by mounting the whole page. See logic.test.ts.

export const DUPLICATE_NAME_MESSAGE = 'A category with this name already exists.';

// AC-2: duplicate name gets its own inline message, not the generic
// create-failed banner. Matches on the backend's specific duplicate-name
// text so other `name` validation failures (e.g. a blank/whitespace-only
// name) fall through to the generic banner instead of being mislabeled as
// a duplicate.
export function isDuplicateNameError(error: unknown): boolean {
  const nameErrors = axios.isAxiosError<{ name?: string[] }>(error)
    ? error.response?.data?.name
    : undefined;
  return nameErrors?.includes(DUPLICATE_NAME_MESSAGE) ?? false;
}

// AC-3: the blocked-delete message is built from the backend's count
// rather than showing its (English-only) `detail` text as-is, so it's
// properly translated/pluralized in both AR and EN. This function only
// extracts the count - the caller applies t('categories.deleteBlockedError',
// {count}) since that needs i18n, which this module has no access to.
export function getAssignedProductTypeCount(error: unknown): number | undefined {
  return axios.isAxiosError<{ assigned_product_type_count?: number }>(error)
    ? error.response?.data?.assigned_product_type_count
    : undefined;
}
