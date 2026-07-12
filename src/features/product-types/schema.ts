import { z } from 'zod';

export const productTypeSchema = z.object({
  name: z.string().min(1, 'productTypes.form.nameRequired'),
  model_code: z.string().optional(),
  description: z.string().optional(),
  category: z
    .number()
    .optional()
    .refine((value): value is number => value !== undefined, {
      message: 'productTypes.form.categoryRequired',
    }),
});

export type ProductTypeFormValues = z.infer<typeof productTypeSchema>;
