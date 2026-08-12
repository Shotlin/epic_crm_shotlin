# ADR-005: Native encrypted SQLite runtime is a release prerequisite

## Status

Accepted as a production gate; implementation remains pending provider/driver certification.

## Context

Epic BOS currently uses Electron's `node:sqlite` runtime. The persisted database
is sealed with an OS-protected AES-256-GCM envelope during normal shutdown;
new database envelopes use a namespace-separated v2 derived key while v1
files remain readable for migration, but
SQLite pages are plaintext while the application is open. That protects the
normal at-rest lifecycle but does not satisfy a native encrypted-runtime claim.

The obvious Node bindings evaluated during this milestone do not provide a
single certified Windows/macOS/Linux path in the current workspace: the
SQLCipher-oriented bindings available from npm are platform-limited or require
native build and signing evidence that is not present here. Adding a package
name without a working Windows build, key lifecycle, migration test, and
packaged-app evidence would create a false security claim.

## Decision

1. Keep the current envelope lifecycle for development and controlled shadow
   operation.
2. Publish machine-readable `interim-persisted-envelope` evidence from the
   main process.
3. Block production release readiness unless evidence says
   `native-encrypted` and identifies the certified driver/build.
4. Accept a native runtime only after clean-install, migration, key rotation,
   crash recovery, cross-platform package, and independent security tests pass.
5. Do not silently fall back from a certified native driver to `node:sqlite`.
6. Keep the managed backup directory on the same versioned envelope boundary;
   an administrator may inventory and rewrap plaintext/v1 files atomically,
   while files saved outside that directory remain an explicit migration task.

The main process now enforces this decision through an explicit driver
selection boundary. With no certified driver registered it reports the known
`node:sqlite` envelope lifecycle. If a driver is registered but its probe
returns non-native evidence or throws, selection becomes `unknown` and the
release gate remains blocked; it never changes to the interim driver behind
the operator's back.

## Consequences

- Developers can continue working without claiming production-grade runtime
  encryption.
- The release screen now exposes the exact blocker instead of presenting a
  false green readiness state.
- A future driver selection must include Windows support, because the current
  product is packaged and tested on Windows as well as planned macOS/Linux
  targets.

## Exit evidence

The gate can be removed only when the runtime evidence reports
`native-encrypted` and the associated release artifact includes the driver
identity, key-management test, migration/rollback test, and crash-recovery
evidence for every supported platform.
