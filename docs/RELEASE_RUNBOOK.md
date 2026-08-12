# Epic BOS release and operations runbook

## Purpose and truth boundary

This is an operator procedure, not a release approval. A release remains **on hold** until the Epic BOS control room shows the relevant gates as ready and the required evidence has been independently verified.

Epic BOS creates a `releaseIdentitySha256` from the product name, version, build revision, and schema revision. The build revision is injected into the main bundle at build time from `EPIC_BOS_BUILD_REVISION` or the source Git commit; the running app does not read that revision from its environment. A workspace without a source revision is explicitly `unversioned-local`: it can run for development, but artifact and update evidence cannot be submitted until a traceable revision is built. Artifact and update evidence is bound to that identity by the main process. A version string or an old evidence record by itself is not enough: a changed build or credential must be treated as a new approval subject.

Do not copy secrets, raw provider responses, customer data, or device payloads into a release ticket or support packet.

## Roles

| Role | Responsibility | Separation rule |
| --- | --- | --- |
| Release maker | Builds the artifact and records its evidence. | Cannot verify their own artifact or update evidence. |
| Independent reviewer | Checks the artifact, checksum, smoke test, signatures, and rollback evidence. | Must be a different authenticated user. |
| Release owner | Makes the go/hold decision and coordinates rollback. | Must use the current control-room reports, not a spreadsheet-only decision. |
| Store recovery lead | Owns backup/restore and offline-store recovery evidence. | Does not approve their own unresolved cash or stock exception. |

## 1. Prepare a release candidate

1. Freeze the intended version, build revision, schema revision, and release notes. A change to any of them creates a new release identity.
2. Run the local quality gates from the application root:

   ```powershell
   pnpm typecheck
   pnpm test
   pnpm lint
   ```

3. Record the actual command output or CI job URLs as gate evidence. Do not record a passed status for a command that was not run on this candidate.
4. Review the backup/restore gate using a controlled restore drill. See [STORE_RECOVERY_RUNBOOK.md](STORE_RECOVERY_RUNBOOK.md).
5. Review provider certification freshness. A credential rotation invalidates the approval evidence created under the old credential revision; re-run the affected provider conformance flow before release.

The Bakaloo backend repository also runs its full Vitest and ESLint gates in
`.github/workflows/quality.yml` for every push and pull request. A green CI
job is required evidence for source quality, but it does not replace the
environmental `ops:preflight` or any provider/device/recovery certification.

Before treating the backend environment as a release candidate, run its
read-only production preflight from `audit/bakaloo-backend`:

```powershell
pnpm ops:preflight
```

The command returns redacted JSON and exits `0` only when production mode,
strict auth flags, demo-disable flags, required secrets/MFA key,
PostgreSQL/Redis probes, provider configuration, production origins, migration
planning, and independently verified provider evidence all pass. Exit `2` is a
truthful **hold** and is expected on a developer machine. The preflight never
writes application state and cannot replace provider, device, recovery, or
independent approval evidence.

## 2. Package on the target operating system

The current Electron Forge configuration contains these makers:

| Target | Configured package form | Native release requirement |
| --- | --- | --- |
| Windows | Squirrel installer | Build and smoke test on Windows. |
| macOS | ZIP archive | Build and smoke test on macOS. Apple signing and notarisation are separately required. |
| Linux | DEB and RPM packages | Build and smoke test in the target Linux release environment. |

Use the package command only in the intended target environment:

```powershell
pnpm make
```

The package command proves only that packaging completed. It does **not** prove that an installer is signed, that macOS is notarised, that an update can be downloaded, or that another operating system has been tested.

The repository's macOS matrix job uses the explicit x64 `macos-15-intel`
runner. Do not restore the retired `macos-13` label; the native job must still
produce and smoke-test the artifact before signing and notarisation evidence
can be submitted.

Native release jobs set `EPIC_BOS_NATIVE_BUILD=true`. A cross-platform ZIP
inspection build sets `EPIC_BOS_ZIP_ONLY_CROSS_BUILD=true` and is recorded as
`buildEnvironment: cross`; a local build without either flag is
`buildEnvironment: unknown`. The release-matrix verifier accepts only
`native` artifacts for a platform release row, so an inspection artifact can
never be mistaken for a certified Linux or macOS build.

For each platform, complete a clean-install and launch smoke test with the produced artifact. Record:

- artifact location/reference and SHA-256;
- release identity shown by the current build;
- clean-install and launch smoke-test reference;
- code-signing reference;
- macOS notarisation and staple-verification reference, where applicable;
- builder identity, reviewer identity, timestamps, and any known limitations.

`pnpm make` also writes a checksum sidecar next to each file returned by the Forge maker, for example `Epic BOS-0.1.0 Setup.exe.manifest.json`. Treat this sidecar as the machine-readable starting point for the evidence packet: verify that `artifactSha256` matches the distributable, that `releaseIdentitySha256` matches the active build identity, that `buildEnvironment` is `native`, and that `schemaRevision` is the migration revision used by the packaged app. The sidecar itself is not a signature and does not replace clean-install, signing, notarisation, independent review, or provider certification. A make run without `EPIC_BOS_BUILD_REVISION` (or a source Git revision) remains `unversioned-local` and cannot produce approval-grade manifests.

For a complete native matrix, run the cross-platform integrity gate after the
Windows, macOS and Linux artifacts have been collected:

```powershell
pnpm verify:release-matrix -- out\\make 0.1.77
```

The command verifies every sidecar and requires explicit rows for all three
platforms. It rejects mixed version/schema/build identities within a platform
and exits non-zero when a native artifact is missing. A passing integrity
report still leaves the release decision on **hold** until signatures,
notarisation, external provider/device evidence, human UAT and independent
approval are attached.

Submit that information as artifact evidence in Epic BOS. The main process rejects a platform or version mismatch and injects the active release identity. An independent reviewer must verify the submitted evidence before the platform can be marked ready.

### Build the review handoff pack

After artifact and smoke evidence exist, create one deterministic handoff directory for the independent reviewer:

```powershell
pnpm prepare:release-pack -- out\\make out\\smoke-evidence\\win32-0.1.75.json out\\release-certification\\win32-0.1.75 win32 0.1.75
```

The command verifies every matching manifest, binds available smoke evidence to the same build identity, and writes `release-certification-index.json` plus a plain-language `README.md`. It always sets `goNoGo` to `hold`: signatures, provider credentials, physical-device acknowledgements, and independent approval must still be supplied separately. Use `-` instead of a smoke-evidence path when native evidence is not available; the pack records that absence rather than inventing a pass.

### Signing keys and notarisation

The repository configures package makers, but it does not itself contain production signing identities, Apple credentials, or distribution keys. Before asserting a production-ready platform, supply these through the approved CI secret store or OS keychain:

- Windows: an Authenticode certificate, protected private key access, and timestamping service policy;
- macOS: Apple Developer signing identity, Team ID, notarisation credentials, and staple verification;
- Linux: the distribution/repository signing key and publication provenance policy.

Never place any of these secrets in source, `.env` files committed to the repository, screenshots, support diagnostics, or evidence notes.

## 3. Update channels and rollback

Epic BOS records update evidence and validates its source build identity. Packaged Windows and macOS builds can expose a read-only updater status when `EPIC_BOS_UPDATE_FEED_URL` is a valid HTTPS URL; Linux is explicitly reported as unsupported by Electron's built-in updater. This status boundary rejects feed URLs with embedded credentials and never starts a check, download, installation, restart, staged rollout, or rollback by itself. Do not advertise automatic updates until the signed feed, controlled check/download/install flow, rollback behavior, and platform evidence have been implemented and tested.

When an update implementation is available, use this order for every `stable` or `beta` channel and platform:

1. Start with a platform artifact that is independently verified for the active release identity.
2. Produce a signed update manifest, record its SHA-256 and immutable reference.
3. Record current version, target version, and a tested rollback version.
4. Execute the rollback drill on a non-production device or an approved pilot device. Capture the result as a rollback-test reference.
5. Submit the update evidence; an independent release operator verifies it.
6. Pilot the update with a small, observable cohort before a wider rollout. Hold or withdraw the channel on crash, data-integrity, or rollback failure.

Evidence linked to a different release identity is deliberately invalid. Rebuild and re-run the relevant checks instead of relabelling or reusing old evidence.

Before submitting artifact or update evidence, confirm the support diagnostics show a traceable build revision (Git SHA or approved CI revision). `unversioned-local` is a development state and must not be used for a release approval.

## 4. Monitoring, support, and incident response

The application can create local, redacted support diagnostics with health, readiness, and build provenance. It has no configured remote crash-reporting, alerting, or monitoring destination at this time. Before a production rollout, the release owner must select and configure an approved monitoring service with:

- crash and error ingestion that removes secrets and customer-sensitive data;
- authenticated alert routing and an on-call owner;
- retention, access-control, and deletion policy appropriate for Indian business data;
- tested incident escalation, release hold, and customer communication procedures.

If a released artifact is suspected to be faulty:

1. Pause distribution of the affected platform/channel.
2. Preserve the artifact hash, release identity, support diagnostics, and incident timeline.
3. Do not overwrite offline queues or active databases while investigating.
4. Restore only through the verified recovery procedure, if needed.
5. Create a new release candidate for any source or packaging change; do not reuse the old approval evidence.

## 5. Provider and external certification gates

The following require actual provider contracts, credentials, sandbox/production access, and independently retained test evidence. They cannot be completed by local code alone:

- GST GSP/IRP and e-invoice/e-way bill submission;
- banking, UPI, card settlement, and payout providers;
- ONDC/marketplace, logistics, and returns/RTO settlement flows;
- WhatsApp/DLT or other messaging providers;
- payroll and any external compliance connector;
- physical-store device manufacturers, native drivers, and actual hardware acknowledgements.

Provider credentials are versioned. Rotating a secret makes prior approval evidence stale for that connector. Revalidate the credential, repeat the conformance cases, and obtain a new independent approval before treating the connector as ready.

## 6. Final go/hold checklist

The release owner may mark a platform/channel **go** only when all applicable items are true:

- TypeScript, tests, lint, packaging, and controlled backup/restore evidence are current and passed.
- The artifact checksum, smoke test, signing evidence, and release identity have been independently verified for that platform.
- macOS additionally has current notarisation and staple-verification evidence.
- Update channel evidence is current, verified, and tied to the same release identity, if updates are enabled.
- No provider, credential, device, security, or data-recovery hold remains for the released scope.
- Monitoring/on-call and rollback ownership are active for production, not merely planned.

For Store Edge specifically, the release control room must also show the
worker lease/retry/dead-letter service deployed, the atomic inbox/outbox path
enabled, queue metrics exported, and a recent backup/restore plus
conflict-recovery drill. The four server-side configuration flags are
`RETAIL_HUB_STORE_EDGE_WORKER_CONFIGURED`,
`RETAIL_HUB_STORE_EDGE_ATOMIC_INBOX_CONFIGURED`,
`RETAIL_HUB_STORE_EDGE_METRICS_CONFIGURED`, and
`RETAIL_HUB_STORE_EDGE_RECOVERY_CONFIGURED`; missing or malformed values are a
hold, never an implicit development default.

If any item is missing, rejected, stale, or external-certification pending, the correct state is **hold**. The control-room readiness report is the source of truth for that decision.
