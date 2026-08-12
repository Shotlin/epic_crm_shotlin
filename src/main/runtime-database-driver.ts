import type { RuntimeDatabaseEncryptionEvidence } from '../shared/kernel-contracts';

/**
 * The only supported way to promote the Store Edge runtime to native page
 * encryption is an explicitly supplied, independently certified driver. The
 * probe is deliberately synchronous because it runs during main-process
 * startup before IPC health is exposed.
 */
export interface NativeEncryptedRuntimeDriver {
  readonly id: string;
  probe(now: string): RuntimeDatabaseEncryptionEvidence;
}

export interface RuntimeDatabaseDriverSelection {
  evidence: RuntimeDatabaseEncryptionEvidence;
  source: 'native-driver' | 'node-sqlite-envelope' | 'fail-closed';
}

function interimEvidence(checkedAt: string): RuntimeDatabaseEncryptionEvidence {
  return {
    status: 'interim-persisted-envelope',
    driver: 'node:sqlite',
    statement: 'Persisted database files are encrypted; the active SQLite runtime is not natively page-encrypted.',
    checkedAt,
  };
}

function failClosedEvidence(driver: string, checkedAt: string, statement: string): RuntimeDatabaseEncryptionEvidence {
  return {
    status: 'unknown',
    driver,
    statement,
    checkedAt,
  };
}

function isUsableNativeEvidence(evidence: RuntimeDatabaseEncryptionEvidence, driver: NativeEncryptedRuntimeDriver): boolean {
  return evidence.status === 'native-encrypted'
    && evidence.driver.trim().length > 0
    && evidence.driver === driver.id
    && evidence.statement.trim().length > 0
    && evidence.checkedAt.trim().length > 0;
}

/**
 * Selects the active database security evidence without ever silently
 * downgrading a configured native driver. When no driver is registered, the
 * known interim envelope lifecycle is returned. When a driver is registered
 * but its probe fails, the result is `unknown`, which keeps release gates
 * blocked until an operator investigates the failure.
 */
export function selectRuntimeDatabaseDriver(
  checkedAt: string,
  nativeDriver?: NativeEncryptedRuntimeDriver,
): RuntimeDatabaseDriverSelection {
  if (!nativeDriver) {
    return { evidence: interimEvidence(checkedAt), source: 'node-sqlite-envelope' };
  }

  try {
    const evidence = nativeDriver.probe(checkedAt);
    if (isUsableNativeEvidence(evidence, nativeDriver)) {
      return { evidence, source: 'native-driver' };
    }

    return {
      evidence: failClosedEvidence(
        nativeDriver.id,
        checkedAt,
        `Native runtime probe for ${nativeDriver.id} did not produce certified native-encryption evidence; no SQLite fallback was selected.`,
      ),
      source: 'fail-closed',
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      evidence: failClosedEvidence(
        nativeDriver.id,
        checkedAt,
        `Native runtime probe for ${nativeDriver.id} failed (${reason}); no SQLite fallback was selected.`,
      ),
      source: 'fail-closed',
    };
  }
}
