import { describe, expect, it } from 'vitest';
import { classifyItemRejection } from './logic';

function makeAxiosError(data: unknown) {
  return { isAxiosError: true, response: { status: 400, data } };
}

describe('classifyItemRejection', () => {
  it('classifies an "already in another box" rejection, extracting the serial and box code', () => {
    const error = makeAxiosError({ item_ids: ['SN-042 is already in box BX-001'] });

    expect(classifyItemRejection(error)).toEqual({
      messageKey: 'boxes.form.itemAlreadyInBoxError',
      params: { serial: 'SN-042', boxCode: 'BX-001' },
    });
  });

  it('classifies a "not available" rejection, extracting the serial', () => {
    const error = makeAxiosError({ item_ids: ['SN-099 is not available to box'] });

    expect(classifyItemRejection(error)).toEqual({
      messageKey: 'boxes.form.itemNotAvailableError',
      params: { serial: 'SN-099' },
    });
  });

  it('classifies a "wrong product type" rejection, extracting the serial', () => {
    const error = makeAxiosError({
      item_ids: ["SN-013 does not match this box's product type"],
    });

    expect(classifyItemRejection(error)).toEqual({
      messageKey: 'boxes.form.itemProductTypeMismatchError',
      params: { serial: 'SN-013' },
    });
  });

  it('returns null for a generic DRF field error with no free-text identifier', () => {
    const error = makeAxiosError({ item_ids: ['Select an item that exists.'] });

    expect(classifyItemRejection(error)).toBeNull();
  });

  it('returns null when item_ids has no error', () => {
    const error = makeAxiosError({ code: ['Box code is required.'] });

    expect(classifyItemRejection(error)).toBeNull();
  });

  it('returns null for a non-axios error', () => {
    expect(classifyItemRejection(new Error('boom'))).toBeNull();
  });
});
