import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(1, 'categories.form.nameRequired'),
  description: z.string().optional(),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;
