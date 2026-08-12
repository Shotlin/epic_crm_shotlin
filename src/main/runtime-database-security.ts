import type { RuntimeDatabaseEncryptionEvidence } from '../shared/kernel-contracts';
import { selectRuntimeDatabaseDriver, type NativeEncryptedRuntimeDriver } from './runtime-database-driver';

/**
 * The current Store Edge engine is node:sqlite. Persisted files are sealed
 * with an OS-protected AES-GCM envelope, but SQLite pages are plaintext while
 * the process is running. Keep this fact machine-readable so release gates
 * cannot accidentally treat the interim lifecycle as native SQLCipher.
 */
export function getRuntimeDatabaseEncryptionEvidence(
  now = new Date().toISOString(),
  nativeDriver?: NativeEncryptedRuntimeDriver,
): RuntimeDatabaseEncryptionEvidence {
  return selectRuntimeDatabaseDriver(now, nativeDriver).evidence;
}

/**
 * Production must never silently fall back to the interim node:sqlite window.
 * Local development and migration tooling may still use the persisted AES-GCM
 * envelope, but a release environment can opt into a fail-closed startup gate
 * until a certified SQLCipher/equivalent native driver is actually packaged.
 */
export function assertRuntimeDatabaseEncryptionReady(
  evidence: RuntimeDatabaseEncryptionEvidence,
  requireNativeEncryption = false,
): void {
  if (!requireNativeEncryption || evidence.status === 'native-encrypted') return;
  throw new Error(
    `NATIVE_RUNTIME_SQLITE_REQUIRED: ${evidence.driver} is not a native page-encrypted runtime. `
      + 'Install and certify the approved SQLCipher/equivalent native driver before production startup.',
  );
}

/**
 * Keep environment parsing at the process boundary; the assertion above stays
 * deterministic and easy to exercise in unit tests.
 */
export function isNativeRuntimeEncryptionRequired(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes(value?.trim().toLowerCase() ?? '');
}
