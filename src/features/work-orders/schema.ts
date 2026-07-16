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
});

export type WorkOrderLineItemFormValues = z.infer<typeof workOrderLineItemSchema>;
export type WorkOrderFormValues = z.infer<typeof workOrderSchema>;
