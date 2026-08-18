export const ROUTES = {
  dashboard: '/',
  productTypes: '/product-types',
  categories: '/categories',
  serializedItems: '/serialized-items',
  boxes: '/boxes',
  purchaseOrders: '/purchase-orders',
  workOrders: '/work-orders',
  // WRH-70: pattern for App.tsx's route table; workOrderDetailPath builds the
  // concrete href for a given WO id (deep links from e.g. Missing Items).
  workOrderDetailPattern: '/work-orders/:id',
  workOrderDetailPath: (id: number | string) => `/work-orders/${id}`,
  missingItems: '/missing-items',
  damageReports: '/damage-reports',
  maintenanceOrders: '/maintenance-orders',
  transactionLog: '/transaction-log',
  settings: '/settings',
} as const;
