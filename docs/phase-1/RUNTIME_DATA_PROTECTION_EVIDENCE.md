# Phase 1 — Local Runtime Data Protection Evidence

**Status:** internally hardened, but **not native page-encryption certified**.
**Reviewed:** 2026-08-13
**Scope:** Electron Store Edge SQLite persistence, backups, restore staging, and local master-key custody.

## What is protected now

Epic BOS uses Electron `safeStorage` to protect a 256-bit local master key in
`data/secrets/keyring.v2.json`. The key itself never crosses the preload or
renderer boundary. Namespace-separated AES-256-GCM envelopes use that master
key for:

- persisted Store Edge database: `epic-bos.sqlite3.enc` (`runtime-database` namespace);
- database backups and restore candidates (`database-backup` namespace);
- attachments, MFA factors, statutory secrets, and provider credentials through
  their own existing artifact namespaces.

On a normal desktop shutdown, `main.ts` closes `BusinessDatabase`, seals
`epic-bos.sqlite3.runtime` atomically as `epic-bos.sqlite3.enc`, then removes
the plaintext runtime and SQLite sidecars. A legacy plaintext database is
migrated only after an integrity check and is then removed. This is active
runtime persistence protection, not merely backup encryption.

Interactive restore staging is now also envelope-protected. `BackupService`
validates the selected source in a temporary directory and writes only
`epic-bos.sqlite3.runtime.restore-next.enc` into the app data directory.
Immediately before the local restore swap, `ProtectedDatabaseFile`
authenticates and materializes the candidate. It checkpoints and reseals the
current runtime before replacing
it, so no plaintext `.before-restore-*` rollback archive is created. The
encrypted candidate is deleted only after the plaintext stage has demonstrably
been consumed. If a power loss leaves both copies, Epic BOS compares their
verified bytes; a mismatch fails closed and retains both candidates for
recovery instead of guessing or deleting data. Stale plaintext rollback
archives from older builds are removed only after the current runtime has been
checkpointed and resealed; ambiguous legacy artifacts block startup intact.

## Exact remaining boundary

The active `node:sqlite` file must be plaintext while the desktop process is
using it. This implementation is therefore accurately reported as
`interim-persisted-envelope`, not `native-encrypted`.

Consequences:

- During a running process, `*.runtime` (and, after an abrupt power loss, its
  WAL/SHM sidecars) can remain plaintext on the local filesystem until a
  successful restart or graceful sealing.
- During the immediate restore swap, the authenticated candidate is briefly
  materialized as `*.runtime.restore-next` (or its atomic `.next` sibling).
  A crash can leave that raw candidate until the next launch compares it with
  the retained encrypted candidate and either safely resumes or fails closed.
- Node's current SQLite API requires a filesystem-backed file for database
  inspection. The backup/restore service therefore creates short-lived raw
  inspection and online-backup files in the operating-system temporary
  directory and removes them on every normal success/failure path. An abrupt
  process or host failure can leave such a temporary file behind until host
  cleanup. This means the implementation cannot truthfully claim *zero*
  plaintext crash residue beyond the active runtime without a native
  encrypted SQLite driver (or an in-memory SQLite deserialization API).
- The encrypted envelope protects the normal persisted state, backup files and
  restore candidates; it is not SQLCipher and does not protect live SQLite
  pages from a local process/administrator with filesystem access.
- OS account ACLs and full-disk encryption are recommended host controls, but
  they are not represented as Epic BOS cryptographic certification.

`EPIC_BOS_REQUIRE_NATIVE_SQLITE=1` (`true` or `yes`) keeps a production launch
fail-closed until an explicitly certified `NativeEncryptedRuntimeDriver`
reports `native-encrypted`. No SQLCipher/native driver is currently packaged,
so this gate must remain enabled for a production policy that requires
page-level encryption.

## Migration and recovery guarantees

- Legacy plaintext database -> verified runtime -> authenticated v2 envelope.
- Legacy v1 envelopes remain readable only for migration; new envelopes use the
  versioned v2 artifact key.
- Key rotation verifies a newly sealed database before swapping it and retains
  the old envelope if the swap fails.
- A staged restore envelope is retained until the local swap is complete; the
  runtime WAL is checkpointed before the final envelope is written.
- Restore rollback uses an encrypted current-runtime envelope rather than a
  plaintext rollback archive. Legacy archives are either securely retired or
  held as explicit recovery evidence when their state is ambiguous.
- Divergent staged plaintext/encrypted copies are preserved and reported as a
  recovery conflict; they are never silently reconciled.

## Verified focused coverage

`src/main/protected-database-file.test.ts` covers:

1. legacy plaintext migration and normal encrypted restart;
2. v1 compatibility, authenticated tamper rejection, key rotation and
   power-loss/WAL checkpoint-and-seal recovery;
3. encrypted restore-stage application with removal only after consumption;
4. no plaintext rollback archive for new swaps plus retirement of a verified
   legacy archive;
5. interrupted stage recovery when copies match; and
6. fail-closed retention when they differ.

`src/main/runtime-database-security.test.ts` and
`src/main/runtime-database-driver.test.ts` cover the truthful evidence state
and the native-encryption production gate.

## Required path to native encryption certification

1. Select a maintained SQLCipher/equivalent native SQLite runtime for each
   supported OS and have its binary provenance independently reviewed.
2. Implement it as a real `NativeEncryptedRuntimeDriver`, including key
   injection from the main-process keyring only and an integrity/driver probe.
3. Run migration, rollback, interrupted-write, power-loss, performance, and
   clean-install tests against Windows, macOS and Linux packages.
4. Enable `EPIC_BOS_REQUIRE_NATIVE_SQLITE=1` in production packaging and
   collect independent security approval before claiming native encryption.

Until those steps are complete, this document is the authoritative boundary:
encrypted persisted lifecycle is implemented; native page encryption is an
external production gate, not a completed feature.
