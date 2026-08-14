import { z } from 'zod';

// AC-1: only field a manager submits is the set of damaged items to group
// under a new MO - status/reference are server-assigned, matching
// BoxSerializer's identical write-shape split (item_ids in, richer object
// out).
export const maintenanceOrderSchema = z.object({
  item_ids: z.array(z.number()).min(1, 'maintenanceOrders.form.itemsRequired'),
});

export type MaintenanceOrderFormValues = z.infer<typeof maintenanceOrderSchema>;
