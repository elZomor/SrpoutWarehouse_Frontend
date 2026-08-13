import { z } from 'zod';

export const damageReportSchema = z.object({
  serial_number: z.string().min(1, 'damageReports.form.serialNumberRequired'),
  note: z.string().optional(),
});

export type DamageReportFormValues = z.infer<typeof damageReportSchema>;
