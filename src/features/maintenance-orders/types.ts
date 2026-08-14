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
