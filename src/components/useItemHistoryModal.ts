import { useState } from 'react';
import type { ItemHistoryTarget } from './ItemHistoryModal';

// WRH-79/code-review: the `historyItem` state + `<ItemHistoryModal item=...
// open=... onClose=.../>` wiring was duplicated near-verbatim across
// SerializedItemsPage, BoxesPage, and WorkOrdersPage - factored out here so
// a future fix to this wiring only needs to land once. Not colocated in
// ItemHistoryModal.tsx, since a component file may only export components
// (react-refresh/only-export-components).
export function useItemHistoryModal() {
  const [historyItem, setHistoryItem] = useState<ItemHistoryTarget | null>(null);

  return {
    openHistoryItem: setHistoryItem,
    historyModalProps: {
      item: historyItem,
      open: historyItem !== null,
      onClose: () => setHistoryItem(null),
    },
  };
}
