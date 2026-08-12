import { describe, expect, it } from 'vitest';
import {
  assertRuntimeDatabaseEncryptionReady,
  getRuntimeDatabaseEncryptionEvidence,
  isNativeRuntimeEncryptionRequired,
} from './runtime-database-security';
import type { RuntimeDatabaseEncryptionEvidence } from '../shared/kernel-contracts';

describe('runtime database security evidence', () => {
  it('truthfully reports the current node:sqlite envelope boundary', () => {
    expect(getRuntimeDatabaseEncryptionEvidence('2026-08-06T00:00:00.000Z')).toEqual({
      status: 'interim-persisted-envelope',
      driver: 'node:sqlite',
      statement: 'Persisted database files are encrypted; the active SQLite runtime is not natively page-encrypted.',
      checkedAt: '2026-08-06T00:00:00.000Z',
    });
  });

  it('allows the interim boundary for local development when the gate is disabled', () => {
    expect(() => assertRuntimeDatabaseEncryptionReady(
      getRuntimeDatabaseEncryptionEvidence('2026-08-10T00:00:00.000Z'),
    )).not.toThrow();
  });

  it('fails closed before production startup when native encryption is required', () => {
    expect(() => assertRuntimeDatabaseEncryptionReady(
      getRuntimeDatabaseEncryptionEvidence('2026-08-10T00:00:00.000Z'),
      true,
    )).toThrow(/NATIVE_RUNTIME_SQLITE_REQUIRED/);
  });

  it('accepts certified native evidence when the production gate is enabled', () => {
    const evidence: RuntimeDatabaseEncryptionEvidence = {
      status: 'native-encrypted',
      driver: 'epic-bos-sqlcipher',
      statement: 'SQLite pages are encrypted by the certified native runtime.',
      checkedAt: '2026-08-10T00:00:00.000Z',
    };
    expect(() => assertRuntimeDatabaseEncryptionReady(evidence, true)).not.toThrow();
  });

  it('parses only explicit truthy production gate values', () => {
    expect(isNativeRuntimeEncryptionRequired('1')).toBe(true);
    expect(isNativeRuntimeEncryptionRequired('TRUE')).toBe(true);
    expect(isNativeRuntimeEncryptionRequired('yes')).toBe(true);
    expect(isNativeRuntimeEncryptionRequired('0')).toBe(false);
    expect(isNativeRuntimeEncryptionRequired(undefined)).toBe(false);
  });
});
