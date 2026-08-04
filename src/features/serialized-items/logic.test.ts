import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import {
  getSerializedItemStatusColor,
  isDuplicateSerialError,
  resolveQrDownloadErrorMessageKey,
} from './logic';

// Moved off SerializedItemsPage.test.tsx (WRH-34) - full page-mount tests
// standing in for what's pure error-shape classification.

function makeAxiosError(data: unknown, status = 400): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = { data, status, statusText: '', headers: {}, config: {} as never };
  return error;
}

describe('isDuplicateSerialError', () => {
  it('is true for the array-of-strings duplicate shape', () => {
    expect(
      isDuplicateSerialError(
        makeAxiosError({ serial_number: ['Serial number SN-042 is already registered.'] }),
      ),
    ).toBe(true);
  });

  it('is true for the bare-string DB-constraint-race fallback shape', () => {
    expect(
      isDuplicateSerialError(
        makeAxiosError({ serial_number: 'Serial number SN-042 is already registered.' }),
      ),
    ).toBe(true);
  });

  it('is false for a whitespace-only serial number (required error, not a duplicate)', () => {
    expect(
      isDuplicateSerialError(makeAxiosError({ serial_number: ['This field may not be blank.'] })),
    ).toBe(false);
  });

  it('is false for an over-length serial number', () => {
    expect(
      isDuplicateSerialError(
        makeAxiosError({
          serial_number: ['Ensure this field has no more than 100 characters.'],
        }),
      ),
    ).toBe(false);
  });

  it('is false when there is no serial_number error at all', () => {
    expect(isDuplicateSerialError(makeAxiosError({}))).toBe(false);
  });
});

describe('resolveQrDownloadErrorMessageKey', () => {
  it('returns the type-scoped "no items" key on a 400 with a product type filter set', () => {
    expect(resolveQrDownloadErrorMessageKey(makeAxiosError({}, 400), true)).toBe(
      'serializedItems.downloadQrPdfNoItemsForType',
    );
  });

  it('returns the generic "no items" key on a 400 with no filter (All)', () => {
    expect(resolveQrDownloadErrorMessageKey(makeAxiosError({}, 400), false)).toBe(
      'serializedItems.downloadQrPdfNoItems',
    );
  });

  it('returns the generic download-error key for a real (non-400) failure', () => {
    expect(resolveQrDownloadErrorMessageKey(makeAxiosError({}, 500), false)).toBe(
      'serializedItems.downloadQrPdfError',
    );
  });

  it('returns the generic download-error key for a non-axios error', () => {
    expect(resolveQrDownloadErrorMessageKey(new Error('boom'), false)).toBe(
      'serializedItems.downloadQrPdfError',
    );
  });
});

describe('getSerializedItemStatusColor', () => {
  it('returns green for available', () => {
    expect(getSerializedItemStatusColor('available')).toBe('green');
  });

  it('falls back to the default color for an unrecognized status', () => {
    expect(getSerializedItemStatusColor('missing')).toBe('default');
  });
});
