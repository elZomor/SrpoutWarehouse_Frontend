export interface MissingItem {
  id: number;
  serial_number: string;
  product_type_name: string;
  work_order_id: number | null;
  work_order_reference: string;
  date_missing: string | null;
  status: string;
}
