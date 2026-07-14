import { z } from 'zod';

export const purchaseOrderLineItemSchema = z.object({
  product_type: z
    .number()
    .optional()
    .refine((value): value is number => value !== undefined, {
      message: 'purchaseOrders.form.productTypeRequired',
    }),
  expected_quantity: z
    .number()
    .optional()
    .refine((value): value is number => typeof value === 'number' && value >= 1, {
      message: 'purchaseOrders.form.expectedQuantityRequired',
    }),
});

export const purchaseOrderSchema = z.object({
  supplier_name: z.string().min(1, 'purchaseOrders.form.supplierNameRequired'),
  order_date: z.string().min(1, 'purchaseOrders.form.orderDateRequired'),
  line_items: z.array(purchaseOrderLineItemSchema).min(1, 'purchaseOrders.form.lineItemsRequired'),
});

export type PurchaseOrderLineItemFormValues = z.infer<typeof purchaseOrderLineItemSchema>;
export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;
