import { z } from 'zod';

export const boxSchema = z.object({
  code: z.string().min(1, 'boxes.form.codeRequired'),
  product_type: z
    .number()
    .optional()
    .refine((value): value is number => value !== undefined, {
      message: 'boxes.form.productTypeRequired',
    }),
  item_ids: z.array(z.number()).min(1, 'boxes.form.itemsRequired'),
});

export type BoxFormValues = z.infer<typeof boxSchema>;
