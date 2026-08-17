import axios from 'axios';
import { getFieldErrorMessages } from '../../lib/apiErrors';

// Extracted out of SerializedItemsPage.tsx (WRH-34 test-suite rework) -
// these were inline error-classification closures in the component,
// unit-tested only by mounting the whole page. See logic.test.ts.

// Keyed by status so a status this map doesn't yet know about falls back to
// DEFAULT_STATUS_COLOR instead of silently inheriting another status's
// color. A Map (not a plain object) avoids eslint-plugin-security's
// detect-object-injection warning on the dynamic-key lookup below.
// WRH-42: 'missing' added here (shared by SerializedItemsPage and
// MissingItemsPage, both of which render this same SerializedItem.status
// field) rather than each page keeping its own local color map, which had
// let 'missing' render inconsistently (grey via this map's old fallback vs.
// a separately-chosen orange on MissingItemsPage) for the identical value.
// WRH-76: 'damaged'/'written_off'/'reserved'/'out' added the same way, so
// every SerializedItem.status value has an explicit, consistent color
// wherever it's rendered instead of a page having to invent its own.
export const STATUS_COLORS = new Map<string, string>([
  ['available', 'green'],
  ['missing', 'orange'],
  // WRH-46: added the same way 'missing' was (WRH-42) - shared by every
  // page that renders this status rather than a page-local map.
  ['in_maintenance', 'purple'],
  ['damaged', 'red'],
  ['written_off', 'default'],
  ['reserved', 'blue'],
  ['out', 'geekblue'],
]);
export const DEFAULT_STATUS_COLOR = 'default';

export function getSerializedItemStatusColor(status: string): string {
  return STATUS_COLORS.get(status) ?? DEFAULT_STATUS_COLOR;
}

// AC-1/AC-2: a raced/duplicate serial number gets its own inline message
// rather than the generic create-failed banner. The backend embeds the
// submitted serial number in its duplicate message ("Serial number SN-042
// is already registered."), so an exact-text match can't work - match on
// the stable "already registered" phrase instead. This deliberately does
// NOT match on the serial_number field's mere presence: a whitespace-only
// or over-length serial number also returns a serial_number error
// (required/max-length), and that must still fall through to the generic
// banner rather than being mislabeled as a duplicate.
export function isDuplicateSerialError(error: unknown): boolean {
  const serialErrors = getFieldErrorMessages(error, 'serial_number');
  return serialErrors.some((message) => message.includes('already registered'));
}

// AC-1/AC-2: the backend rejects an empty export with a 400 (see qr_pdf's
// ValidationError) rather than a genuine failure status - that case gets
// its own "nothing to export" message instead of the generic failure
// banner. Distinguished by status, not by parsing the error body: the
// response is fetched with responseType: 'blob', so even an error
// response's body arrives as a Blob rather than parsed JSON, and
// re-deriving "was this the empty-result case" from hasProductTypeFilter
// (already known client-side, and exactly what the backend itself branches
// on) is simpler than decoding it.
export function resolveQrDownloadErrorMessageKey(
  error: unknown,
  hasProductTypeFilter: boolean,
): string {
  if (axios.isAxiosError(error) && error.response?.status === 400) {
    return hasProductTypeFilter
      ? 'serializedItems.downloadQrPdfNoItemsForType'
      : 'serializedItems.downloadQrPdfNoItems';
  }
  return 'serializedItems.downloadQrPdfError';
}
