// WRH-45/AC-3: "Serial not found" is now a fixed constant (no serial_number
// embedded), matching classifyScanRejection's identical exact-equality
// checks for WorkOrderViewSet's same-shaped literal in
// features/work-orders/logic.ts - checked by equality, not a pattern.
export const NOT_FOUND_MESSAGE = 'Serial not found';

// WRH-45/AC-1: DamageReportCreateSerializer's not-available rejection embeds
// the submitted serial number (unconstrained free text) followed by a
// status-specific reason - end-anchored so a serial number that happens to
// contain another status word can't misclassify, same reasoning as
// classifyScanRejection's identical patterns in features/work-orders/logic.ts.
export const OUT_PATTERN = /is currently out and cannot be reported damaged directly$/;
export const DAMAGED_PATTERN = /is currently damaged and cannot be reported damaged directly$/;
export const MISSING_PATTERN = /is currently missing and cannot be reported damaged directly$/;
export const IN_MAINTENANCE_PATTERN =
  /is currently in maintenance and cannot be reported damaged directly$/;
export const WRITTEN_OFF_PATTERN =
  /is currently written off and cannot be reported damaged directly$/;
// Catches any other status this rejection can produce (e.g. "reserved") that
// AC-1 doesn't name individually - still the same "is currently X" shape, so
// still classifiable as an availability rejection rather than falling all
// the way through to the generic serialNumberInvalid catch-all below.
export const OTHER_STATUS_PATTERN = /is currently .+ and cannot be reported damaged directly$/;

export function resolveDamageReportSerialErrorKey(serialErrors: string[]): string | null {
  if (serialErrors.some((message) => message === NOT_FOUND_MESSAGE)) {
    return 'damageReports.form.serialNumberNotFound';
  }
  if (serialErrors.some((message) => OUT_PATTERN.test(message))) {
    return 'damageReports.form.serialNumberOutError';
  }
  if (serialErrors.some((message) => DAMAGED_PATTERN.test(message))) {
    return 'damageReports.form.serialNumberDamagedError';
  }
  if (serialErrors.some((message) => MISSING_PATTERN.test(message))) {
    return 'damageReports.form.serialNumberMissingError';
  }
  if (serialErrors.some((message) => IN_MAINTENANCE_PATTERN.test(message))) {
    return 'damageReports.form.serialNumberInMaintenanceError';
  }
  if (serialErrors.some((message) => WRITTEN_OFF_PATTERN.test(message))) {
    return 'damageReports.form.serialNumberWrittenOffError';
  }
  if (serialErrors.some((message) => OTHER_STATUS_PATTERN.test(message))) {
    return 'damageReports.form.serialNumberNotAvailable';
  }
  if (serialErrors.length > 0) {
    return 'damageReports.form.serialNumberInvalid';
  }
  return null;
}
