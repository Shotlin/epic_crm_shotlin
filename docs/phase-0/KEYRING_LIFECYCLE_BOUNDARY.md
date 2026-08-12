# Local keyring lifecycle boundary

This document records the narrowly scoped **P0-02A** local keyring change. It is not a claim that SQLite has native encrypted pages or that OS master-key rotation exists. The application now has a separate, guarded v1→v2 artifact-envelope rewrap operation.

## What is persisted

- Legacy installations store one Electron `safeStorage` blob at `secrets/vault-key.v1.bin`.
- Current installations add `secrets/keyring.v2.json`, containing a versioned keyring record and a base64 representation of the **OS-protected** safeStorage blob.
- `keyring.v2.json` never contains a raw AES key. The same 32-byte `local-master-v1` material is retained during migration.

## Safe migration and rollback

1. On first current-version launch, Electron asynchronously decrypts the v1 blob.
2. The application writes an atomic v2 record around the same key material.
3. It intentionally retains v1. A failed/interrupted v2 write and a rollback to an older Epic BOS build can still use the known-good v1 blob.
4. Existing protected database envelopes and backup files remain decryptable through their v1 direct-key reader. New runtime database and backup writes use namespace-separated v2 derived keys; attachments, statutory adapter credentials, provider credentials, and MFA factors use the same v1/v2 dual-read pattern.

The temporary `.next` write is created with owner-only file permissions and is renamed only after serialization completes. A corrupted existing v2 file fails closed; it is never replaced with a newly generated key.

## OS-vault safeguards

- The keyring rejects renderer access and is used only from the Electron main process.
- It requires Electron asynchronous safeStorage availability.
- On Linux it rejects `basic_text` and `unknown` safeStorage backends; a real GNOME Keyring or KWallet backend is required.
- When Electron's async decrypt result has `shouldReEncrypt`, the keyring performs the documented stable second decrypt, then atomically rewrites the safeStorage blob with `encryptStringAsync`.

## Deliberate limitation

This is a compatibility-preserving **keyring format and artifact-key migration**, not master-key rotation. Database and backup envelopes now write v2 namespace-derived keys and read v1 direct-key files; provider, statutory-adapter, MFA, and attachment records have a historical v1/v2 resolver, write v2, and can be re-encrypted one record at a time by a release-control administrator. The operation verifies checksums and reports remaining legacy rows; it does not retire v1 automatically. A future OS master-key rotation still requires an approved inventory and transactional re-encryption of every database envelope, backup, attachment, provider secret, statutory secret, MFA secret, and recovery copy before any old key may be retired.

The managed backup directory now has an admin-only inventory and atomic v1/plaintext-to-v2 rewrap path with integrity verification. Backups saved outside that directory, native encrypted SQLite runtime, crash-window minimization, OS master-key retirement, and cross-platform release evidence remain open P0-02 exit work.
