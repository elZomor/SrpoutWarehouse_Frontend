import { getFieldErrorMessages } from '../../lib/apiErrors';

export interface ItemRejection {
  messageKey: string;
  params?: { serial: string; reference?: string };
}

// WRH-46: item_ids can carry either a generic DRF field error (e.g. "Select
// an item that exists.", "Select at least one item.") or one of two dynamic
// business-rule rejections that embed the offending item's free-text
// serial_number (and, for the maintenance-order case, the other MO's
// reference) - matches classifyItemRejection's (boxes/logic.ts) identical
// "backend embeds unconstrained free text, so an exact match can't work"
// reasoning. Anchored to the message's start/end so the fixed wrapping
// phrase is what classifies it, not whatever happens to be in the serial
// itself. Returns null for the generic DRF messages (and anything
// unrecognized) - those fall through to the existing translated
// createError banner rather than being shown untranslated.
export function classifyItemRejection(error: unknown): ItemRejection | null {
  const itemErrors = getFieldErrorMessages(error, 'item_ids');

  for (const message of itemErrors) {
    const alreadyOnMoMatch = message.match(/^(.+) is already on maintenance order (.+)$/);
    if (alreadyOnMoMatch) {
      return {
        messageKey: 'maintenanceOrders.form.itemAlreadyOnMaintenanceOrderError',
        params: { serial: alreadyOnMoMatch[1]!, reference: alreadyOnMoMatch[2]! },
      };
    }
    const claimedOnWoMatch = message.match(/^(.+) is currently claimed on a work order$/);
    if (claimedOnWoMatch) {
      return {
        messageKey: 'maintenanceOrders.form.itemClaimedOnWorkOrderError',
        params: { serial: claimedOnWoMatch[1]! },
      };
    }
  }
  return null;
}
