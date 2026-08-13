import { describe, expect, it } from 'vitest';
import { resolveDamageReportSerialErrorKey } from './logic';

describe('resolveDamageReportSerialErrorKey', () => {
  it('classifies an unknown serial number', () => {
    expect(resolveDamageReportSerialErrorKey(['Serial not found'])).toBe(
      'damageReports.form.serialNumberNotFound',
    );
  });

  it('classifies an item that is out', () => {
    expect(
      resolveDamageReportSerialErrorKey([
        'SN-042 is currently out and cannot be reported damaged directly',
      ]),
    ).toBe('damageReports.form.serialNumberOutError');
  });

  it('classifies an already-damaged item', () => {
    expect(
      resolveDamageReportSerialErrorKey([
        'SN-042 is currently damaged and cannot be reported damaged directly',
      ]),
    ).toBe('damageReports.form.serialNumberDamagedError');
  });

  it('classifies a missing item', () => {
    expect(
      resolveDamageReportSerialErrorKey([
        'SN-042 is currently missing and cannot be reported damaged directly',
      ]),
    ).toBe('damageReports.form.serialNumberMissingError');
  });

  it('classifies an item in maintenance', () => {
    expect(
      resolveDamageReportSerialErrorKey([
        'SN-042 is currently in maintenance and cannot be reported damaged directly',
      ]),
    ).toBe('damageReports.form.serialNumberInMaintenanceError');
  });

  it('classifies a written-off item', () => {
    expect(
      resolveDamageReportSerialErrorKey([
        'SN-042 is currently written off and cannot be reported damaged directly',
      ]),
    ).toBe('damageReports.form.serialNumberWrittenOffError');
  });

  it('classifies any other status this rejection can produce as the generic not-available key', () => {
    expect(
      resolveDamageReportSerialErrorKey([
        'SN-042 is currently reserved and cannot be reported damaged directly',
      ]),
    ).toBe('damageReports.form.serialNumberNotAvailable');
  });

  it('does not misclassify when the serial number itself contains another status phrase', () => {
    // The not-available rejection appends the real reason last
    // (end-anchored) - a serial number containing a *different* status
    // reason's phrase must still classify by the real, trailing reason, same
    // end-anchoring logic as classifyScanRejection in
    // features/work-orders/logic.ts.
    const trickySerial = 'is currently damaged and cannot be reported damaged directly';
    expect(
      resolveDamageReportSerialErrorKey([
        `${trickySerial} is currently out and cannot be reported damaged directly`,
      ]),
    ).toBe('damageReports.form.serialNumberOutError');
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
