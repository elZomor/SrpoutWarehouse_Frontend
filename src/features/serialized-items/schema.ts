import { z } from 'zod';

export const serializedItemSchema = z.object({
  serial_number: z.string().min(1, 'serializedItems.form.serialNumberRequired'),
  product_type: z
    .number()
    .optional()
    .refine((value): value is number => value !== undefined, {
      message: 'serializedItems.form.productTypeRequired',
    }),
});

export type SerializedItemFormValues = z.infer<typeof serializedItemSchema>;
