// WRH-44: DamageReportCreateSerializer's serial_number rejections embed the
// submitted serial number itself (unconstrained free text, matching
// SerializedItem.serial_number's own note in the backend) - end-anchored so
// a serial number that happens to contain another reason's phrase can't
// misclassify, same reasoning as classifyScanRejection's identical patterns
// in features/work-orders/logic.ts.
export const NOT_FOUND_PATTERN = /was not found\.$/;
export const NOT_AVAILABLE_PATTERN = /is not available to report as damaged\.$/;

export function resolveDamageReportSerialErrorKey(serialErrors: string[]): string | null {
  if (serialErrors.some((message) => NOT_FOUND_PATTERN.test(message))) {
    return 'damageReports.form.serialNumberNotFound';
  }
  if (serialErrors.some((message) => NOT_AVAILABLE_PATTERN.test(message))) {
    return 'damageReports.form.serialNumberNotAvailable';
  }
  if (serialErrors.length > 0) {
    return 'damageReports.form.serialNumberInvalid';
  }
  return null;
}
