export interface MaintenanceOrderItem {
  id: number;
  serial_number: string;
  status: string;
}

// AC-4/AC-5: one record per action (create/fix/write-off), never
// overwritten - matches the backend's MaintenanceOrderNoteSerializer shape
// exactly. serial_number is null only for a "created" note (no line item
// is being resolved yet at MO-creation time).
export type MaintenanceOrderNoteAction = 'created' | 'fixed' | 'written_off';

export interface MaintenanceOrderNote {
  id: number;
  action: MaintenanceOrderNoteAction;
  text: string;
  serial_number: string | null;
  user_username: string;
  created_at: string;
}

export interface MaintenanceOrder {
  id: number;
  reference: string;
  status: string;
  items: MaintenanceOrderItem[];
  notes: MaintenanceOrderNote[];
}

// AC-1/AC-2: the two outcomes a manager can resolve a line item to -
// matches the backend's MaintenanceOrderResolveSerializer.RESOLUTION_*
// values exactly.
export type MaintenanceOrderResolution = 'fixed' | 'not_fixable';
