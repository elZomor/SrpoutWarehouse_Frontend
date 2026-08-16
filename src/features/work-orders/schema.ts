import { z } from 'zod';

export const workOrderLineItemSchema = z.object({
  product_type: z
    .number()
    .optional()
    .refine((value): value is number => value !== undefined, {
      message: 'workOrders.form.productTypeRequired',
    }),
  quantity: z
    .number()
    .optional()
    .refine((value): value is number => typeof value === 'number' && value >= 1, {
      message: 'workOrders.form.quantityRequired',
    }),
});

export const workOrderSchema = z.object({
  job_name: z.string().min(1, 'workOrders.form.jobNameRequired'),
  client_name: z.string(),
  expected_date_out: z.string().min(1, 'workOrders.form.expectedDateOutRequired'),
  line_items: z.array(workOrderLineItemSchema).min(1, 'workOrders.form.lineItemsRequired'),
  // WRH-53/AC-1/AC-2: optional - set only when the create modal was opened
  // from a Primary row's "Add Supplementary" action (WorkOrdersPage merges
  // it into the submitted payload; it's never a directly-edited form
  // field), matching the backend's identically-optional
  // WorkOrderSerializer.parent_work_order.
  parent_work_order: z.number().optional(),
});

export type WorkOrderLineItemFormValues = z.infer<typeof workOrderLineItemSchema>;
export type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

export const scanItemSchema = z.object({
  line_item: z
    .number()
    .optional()
    .refine((value): value is number => value !== undefined, {
      message: 'workOrders.scan.lineItemRequired',
    }),
  serial_number: z.string().min(1, 'workOrders.scan.serialNumberRequired'),
});

export type ScanItemFormValues = z.infer<typeof scanItemSchema>;

export const returnItemSchema = z.object({
  serial_number: z.string().min(1, 'workOrders.return.serialNumberRequired'),
  // WRH-57/AC-1: optional - omitted (not explicitly false) for a plain
  // return, so the request body matches the pre-WRH-57 wire shape exactly
  // when the "Mark as Damaged" action isn't the one used.
  damaged: z.boolean().optional(),
});

export type ReturnItemFormValues = z.infer<typeof returnItemSchema>;

export const scanBoxSchema = z.object({
  box_code: z.string().min(1, 'workOrders.scan.boxCodeRequired'),
});

export type ScanBoxFormValues = z.infer<typeof scanBoxSchema>;

export const returnBoxSchema = z.object({
  box_code: z.string().min(1, 'workOrders.return.boxCodeRequired'),
});

export type ReturnBoxFormValues = z.infer<typeof returnBoxSchema>;

// WRH-36/AC-1/AC-2: one scanned serial (currently out on the source WO)
// plus its destination WO - mirrors scanItemSchema's line_item
// required-via-refine pattern for the same reason (a Select's "nothing
// chosen yet" state is `undefined`, not an empty string).
// WRH-68: destination_line_item is required too, same required-via-refine
// shape - the backend now needs it to reassign the item's claim onto the
// destination WO's line item.
export const transferItemSchema = z.object({
  serial_number: z.string().min(1, 'workOrders.transfer.serialNumberRequired'),
  destination_work_order: z
    .number()
    .optional()
    .refine((value): value is number => value !== undefined, {
      message: 'workOrders.transfer.destinationRequired',
    }),
  destination_line_item: z
    .number()
    .optional()
    .refine((value): value is number => value !== undefined, {
      message: 'workOrders.transfer.destinationLineItemRequired',
    }),
});

export type TransferItemFormValues = z.infer<typeof transferItemSchema>;
