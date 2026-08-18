import type { KeyboardEvent } from 'react';

// WRH-79/code-review: this onClick + Enter/Space-keydown + tabIndex +
// cursor-style wiring was duplicated near-verbatim across every AntD
// `Table.onRow` in this repo that opens something on row click
// (SerializedItemsPage/BoxesPage/WorkOrdersPage's item-history rows, and
// BoxesPage's own pre-existing box-list row that opens the box detail
// modal) - factored out here, generic over the row record type and the
// value passed to `onOpen`, so a future fix to this interaction only needs
// to land once. Not colocated in a component file, since a component file
// may only export components (react-refresh/only-export-components).
export function clickableRowProps<T, R>(
  record: T,
  toTarget: (record: T) => R,
  onOpen: (target: R) => void,
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
