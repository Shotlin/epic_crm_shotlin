import { describe, expect, it } from 'vitest';
import { selectRuntimeDatabaseDriver } from './runtime-database-driver';

const checkedAt = '2026-08-06T00:00:00.000Z';

describe('runtime database driver selection', () => {
  it('uses the known interim envelope evidence when no native driver is registered', () => {
    expect(selectRuntimeDatabaseDriver(checkedAt)).toEqual({
      source: 'node-sqlite-envelope',
      evidence: {
        status: 'interim-persisted-envelope',
        driver: 'node:sqlite',
        statement: 'Persisted database files are encrypted; the active SQLite runtime is not natively page-encrypted.',
        checkedAt,
      },
    });
  });

  it('accepts only a driver that proves its own native-encryption identity', () => {
    expect(selectRuntimeDatabaseDriver(checkedAt, {
      id: 'sqlcipher-win-x64@1.0.0',
      probe: (now) => ({
        status: 'native-encrypted',
        driver: 'sqlcipher-win-x64@1.0.0',
        statement: 'SQLCipher pages are encrypted with the certified key provider.',
        checkedAt: now,
      }),
    })).toEqual({
      source: 'native-driver',
      evidence: {
        status: 'native-encrypted',
        driver: 'sqlcipher-win-x64@1.0.0',
        statement: 'SQLCipher pages are encrypted with the certified key provider.',
        checkedAt,
      },
    });
  });

  it('fails closed instead of falling back when a configured driver reports interim security', () => {
    const selection = selectRuntimeDatabaseDriver(checkedAt, {
      id: 'sqlcipher-unverified',
      probe: (now) => ({
        status: 'interim-persisted-envelope',
        driver: 'node:sqlite',
        statement: 'Not certified.',
        checkedAt: now,
      }),
    });

    expect(selection.source).toBe('fail-closed');
    expect(selection.evidence.status).toBe('unknown');
    expect(selection.evidence.driver).toBe('sqlcipher-unverified');
    expect(selection.evidence.statement).toContain('no SQLite fallback was selected');
  });

  it('fails closed when a configured driver probe throws', () => {
    const selection = selectRuntimeDatabaseDriver(checkedAt, {
      id: 'sqlcipher-crashed',
      probe: () => { throw new Error('native module unavailable'); },
    });

    expect(selection.source).toBe('fail-closed');
    expect(selection.evidence).toEqual({
      status: 'unknown',
      driver: 'sqlcipher-crashed',
      statement: 'Native runtime probe for sqlcipher-crashed failed (native module unavailable); no SQLite fallback was selected.',
      checkedAt,
    });
  });
});
