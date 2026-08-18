import type { KeyboardEvent } from 'react';

export interface ItemHistoryTarget {
  serial_number: string;
  product_type_name: string;
  status: string;
}

// WRH-79/code-review: the onClick + Enter/Space-keydown + tabIndex +
// cursor-style wiring below was duplicated near-verbatim across
// SerializedItemsPage, BoxesPage, and WorkOrdersPage's item-row Tables -
// factored out here so a future fix to this interaction only needs to land
// once. Matches BoxesPage's own pre-existing row/keydown pattern for its
// box-list rows. Split out of ItemHistoryModal.tsx (its only consumer)
// rather than colocated there, since a component file may only export
// components (react-refresh/only-export-components).
export function itemHistoryRowProps<T>(
  record: T,
  toTarget: (record: T) => ItemHistoryTarget,
  onOpen: (target: ItemHistoryTarget) => void,
) {
  const open = () => onOpen(toTarget(record));
  return {
    onClick: open,
    // Keyboard/screen-reader equivalent of the mouse-only onClick above.
    onKeyDown: (event: KeyboardEvent) => {
      // Only react when the row itself is the key's target, not a bubbled
      // keydown from a nested interactive element (e.g. a Delete/Print QR
      // button in the same row).
      if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
        event.preventDefault();
        open();
      }
    },
    // Not role="button" - that would clobber the row's own semantic "row"
    // role inside the table and break the row/cell accessible-name
    // computation table libraries rely on.
    tabIndex: 0,
    style: { cursor: 'pointer' },
  };
}
