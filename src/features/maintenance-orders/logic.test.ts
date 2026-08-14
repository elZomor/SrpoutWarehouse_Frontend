import { describe, expect, it } from 'vitest';
import { classifyItemRejection } from './logic';

function makeAxiosError(data: unknown) {
  return { isAxiosError: true, response: { status: 400, data } };
}

describe('classifyItemRejection', () => {
  it('classifies an "already on another maintenance order" rejection, extracting the serial and reference', () => {
    const error = makeAxiosError({
      item_ids: ['SN-042 is already on maintenance order MO-0001'],
    });

    expect(classifyItemRejection(error)).toEqual({
      messageKey: 'maintenanceOrders.form.itemAlreadyOnMaintenanceOrderError',
      params: { serial: 'SN-042', reference: 'MO-0001' },
    });
  });

  it('classifies a "currently claimed on a work order" rejection, extracting the serial', () => {
    const error = makeAxiosError({
      item_ids: ['SN-099 is currently claimed on a work order'],
    });

    expect(classifyItemRejection(error)).toEqual({
      messageKey: 'maintenanceOrders.form.itemClaimedOnWorkOrderError',
      params: { serial: 'SN-099' },
    });
  });

  it('returns null for a generic DRF field error with no free-text identifier', () => {
    const error = makeAxiosError({ item_ids: ['Select an item that exists.'] });

    expect(classifyItemRejection(error)).toBeNull();
  });

  it('returns null when item_ids has no error', () => {
    const error = makeAxiosError({ code: ['Some other error.'] });

    expect(classifyItemRejection(error)).toBeNull();
  });

  it('returns null for a non-axios error', () => {
    expect(classifyItemRejection(new Error('boom'))).toBeNull();
  });
});
