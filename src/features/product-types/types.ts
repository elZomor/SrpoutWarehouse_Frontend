export interface ProductType {
  id: number;
  name: string;
  model_code: string;
  description: string;
  category: number;
  category_name: string;
}

// WRH-48/AC-1: one row per product type on the stock dashboard - each count
// is the backend's own direct DB-level Count, not something derived here.
export interface ProductTypeStockSummary {
  id: number;
  name: string;
  total_registered: number;
  out: number;
  damaged: number;
  missing: number;
  available: number;
}
