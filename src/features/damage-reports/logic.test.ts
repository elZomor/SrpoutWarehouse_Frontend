import { describe, expect, it } from 'vitest';
import { resolveDamageReportSerialErrorKey } from './logic';

describe('resolveDamageReportSerialErrorKey', () => {
  it('classifies an unknown serial number', () => {
    expect(resolveDamageReportSerialErrorKey(['Serial number SN-042 was not found.'])).toBe(
      'damageReports.form.serialNumberNotFound',
    );
  });

  it('classifies a not-available item', () => {
    expect(
      resolveDamageReportSerialErrorKey(['SN-042 is not available to report as damaged.']),
    ).toBe('damageReports.form.serialNumberNotAvailable');
  });

  it('does not misclassify a not-found error whose serial number happens to contain the not-available phrase', () => {
    // Both messages append the real reason last (end-anchored) - a serial
    // number containing another reason's phrase must not misclassify,
    // matching classifyScanRejection's identical end-anchoring reasoning.
    const trickySerial = 'is not available to report as damaged';
    expect(
      resolveDamageReportSerialErrorKey([`Serial number ${trickySerial} was not found.`]),
    ).toBe('damageReports.form.serialNumberNotFound');
  });

  it('falls back to a generic invalid key for an unrecognized serial_number error', () => {
    expect(resolveDamageReportSerialErrorKey(['Serial number is required.'])).toBe(
      'damageReports.form.serialNumberInvalid',
    );
  });

  it('returns null when there are no serial_number errors', () => {
    expect(resolveDamageReportSerialErrorKey([])).toBeNull();
  });
});
