export interface BoxItem {
  id: number;
  serial_number: string;
  status: string;
}

export interface Box {
  id: number;
  code: string;
  uuid: string;
  product_type: number;
  product_type_name: string;
  items: BoxItem[];
}
