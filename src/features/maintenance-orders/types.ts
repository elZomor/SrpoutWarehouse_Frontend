export interface MaintenanceOrderItem {
  id: number;
  serial_number: string;
  status: string;
}

export interface MaintenanceOrder {
  id: number;
  reference: string;
  status: string;
  items: MaintenanceOrderItem[];
}

// AC-1/AC-2: the two outcomes a manager can resolve a line item to -
// matches the backend's MaintenanceOrderResolveSerializer.RESOLUTION_*
// values exactly.
export type MaintenanceOrderResolution = 'fixed' | 'not_fixable';
