import { apiClient } from '../../lib/apiClient';
import type { DamageReportFormValues } from './schema';
import type { DamageReport } from './types';

export async function listDamageReports(): Promise<DamageReport[]> {
  const { data } = await apiClient.get<DamageReport[]>('/api/damage-reports/');
  return data;
}

export async function createDamageReport(input: DamageReportFormValues): Promise<DamageReport> {
  const { data } = await apiClient.post<DamageReport>('/api/damage-reports/', input);
  return data;
}
