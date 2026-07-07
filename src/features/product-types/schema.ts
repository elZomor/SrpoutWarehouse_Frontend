import { z } from 'zod';

export const productTypeSchema = z.object({
  name: z.string().min(1, 'productTypes.form.nameRequired'),
  model_code: z.string().optional(),
  description: z.string().optional(),
});

export type ProductTypeFormValues = z.infer<typeof productTypeSchema>;
