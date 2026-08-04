import { getFieldErrorMessages } from '../../lib/apiErrors';

export interface ItemRejection {
  messageKey: string;
  params?: { serial: string; boxCode?: string };
}

// WRH-27/AC-1/AC-2/AC-5: item_ids can carry either a generic DRF field
// error (e.g. "Select an item that exists.", "Select at least one item.")
// or one of three dynamic, per-item business-rule rejections that embed
// the offending item's free-text serial_number (and, for AC-2, the other
// box's free-text code) - matches
// isDuplicateSerialError's identical "backend embeds unconstrained free
// text, so an exact match can't work" reasoning. Anchored to the message's
// start/end (not a loose .includes()) so the fixed wrapping phrase is what
// classifies it, not whatever happens to be in the serial/code itself.
// Returns null for the generic DRF messages (and anything unrecognized) -
// those fall through to the existing translated createError banner rather
// than being shown untranslated.
export function classifyItemRejection(error: unknown): ItemRejection | null {
  const itemErrors = getFieldErrorMessages(error, 'item_ids');

  for (const message of itemErrors) {
    const alreadyInBoxMatch = message.match(/^(.+) is already in box (.+)$/);
    if (alreadyInBoxMatch) {
      return {
        messageKey: 'boxes.form.itemAlreadyInBoxError',
        params: { serial: alreadyInBoxMatch[1]!, boxCode: alreadyInBoxMatch[2]! },
      };
    }
    const notAvailableMatch = message.match(/^(.+) is not available to box$/);
    if (notAvailableMatch) {
      return {
        messageKey: 'boxes.form.itemNotAvailableError',
        params: { serial: notAvailableMatch[1]! },
      };
    }
    const productTypeMismatchMatch = message.match(/^(.+) does not match this box's product type$/);
    if (productTypeMismatchMatch) {
      return {
        messageKey: 'boxes.form.itemProductTypeMismatchError',
        params: { serial: productTypeMismatchMatch[1]! },
      };
    }
  }
  return null;
}
