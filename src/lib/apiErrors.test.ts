import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { getFieldErrorMessages } from './apiErrors';

function makeAxiosError(data: unknown): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = { data, status: 400, statusText: '', headers: {}, config: {} as never };
  return error;
}

describe('getFieldErrorMessages', () => {
  it('normalizes a single string error into a one-element array', () => {
    expect(
      getFieldErrorMessages(
        makeAxiosError({ serial_number: 'Already registered.' }),
        'serial_number',
      ),
    ).toEqual(['Already registered.']);
  });

  it('passes an array error through unchanged', () => {
    expect(
      getFieldErrorMessages(makeAxiosError({ serial_number: ['a', 'b'] }), 'serial_number'),
    ).toEqual(['a', 'b']);
  });

  it('returns an empty array when the field is absent', () => {
    expect(getFieldErrorMessages(makeAxiosError({ other_field: 'x' }), 'serial_number')).toEqual(
      [],
    );
  });

  it('returns an empty array for a non-axios error', () => {
    expect(getFieldErrorMessages(new Error('boom'), 'serial_number')).toEqual([]);
  });

  it('returns an empty array rather than throwing when the response body is a non-object (e.g. a plain-string error page)', () => {
    expect(
      getFieldErrorMessages(makeAxiosError('<html>502 Bad Gateway</html>'), 'serial_number'),
    ).toEqual([]);
  });

  it('returns an empty array rather than throwing when the response body is null', () => {
    expect(getFieldErrorMessages(makeAxiosError(null), 'serial_number')).toEqual([]);
  });
});
