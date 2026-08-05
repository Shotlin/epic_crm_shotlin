import { describe, expect, it } from 'vitest';
import { assertManualRetailCutoverRegistrationAllowed, isManualRetailCutoverRegistrationAllowed } from './retail-cutover-registration-guard';

describe('manual retail cutover registration runtime guard', () => {
  it('allows the legacy fixture route only in unpackaged development and test runtime', () => {
    expect(isManualRetailCutoverRegistrationAllowed({ isPackaged: false, nodeEnv: 'test' })).toBe(true);
    expect(isManualRetailCutoverRegistrationAllowed({ isPackaged: false, nodeEnv: 'development' })).toBe(true);
    expect(isManualRetailCutoverRegistrationAllowed({ isPackaged: false, nodeEnv: 'production' })).toBe(false);
  });

  it('fails closed for every packaged runtime', () => {
    expect(isManualRetailCutoverRegistrationAllowed({ isPackaged: true, nodeEnv: 'development' })).toBe(false);
    expect(() => assertManualRetailCutoverRegistrationAllowed({ isPackaged: true, nodeEnv: 'test' })).toThrow(/disabled outside test\/development/i);
  });
});
