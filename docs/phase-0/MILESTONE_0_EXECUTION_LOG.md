# Phase 0 — Execution Log

This log records reproducible local evidence for the Store Edge control milestone. It is not a production certification and does not replace provider, hardware, security, or live-data evidence.

## 2026-08-07 — envelope rotation control

### Completed in this batch

- Added versioned v1/v2 artifact-key derivation while retaining the OS-protected master key and failing closed on unknown versions.
- Provider connector secrets, statutory adapter secrets, encrypted TOTP MFA factors, and attachments now dual-read v1/v2 and write v2.
- Added a release-control-admin-only IPC action and Control Room action to rewrap and checksum-verify legacy records one at a time; the report is resumable and exposes the remaining-legacy count.
- Added database list/update boundaries for all artifact classes and an attachment atomic replacement path with rollback cleanup.
- Preserved the native encryption boundary: this does not claim SQLCipher/page encryption or OS master-key rotation.

### Verification evidence

| Gate | Result |
|---|---|
| artifact rotation test | PASS — provider, statutory, MFA, and attachment records rewrapped and exported after v2 cutover |
| focused security tests | PASS |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test -- --maxWorkers=1 --minWorkers=1` | PASS — 246 files, 1,054 tests |
| `pnpm build` | PASS — Windows Electron package |
| `pnpm run verify:ipc-policy-alignment` | PASS — 536 permissioned handlers checked |
| `pnpm run verify:capability-registry` | PASS |

## 2026-08-06 — control baseline

### Completed in this batch

- Generated the capability registry from the IPC surface, authorization policy, and programme capability sources.
- Classified all 538 declared IPC channels; the checked-in registry contains 548 records including programme capabilities.
- Removed the legacy `session` authorization mode from the policy type and classified inherited channels as named delegated scope until each handler is promoted to an exact resource/action/record policy.
- Added response projection at the IPC boundary for non-trusted Revenue Operations responses.
- Promoted retail cutover and GST/place-of-supply decision routes to explicit scoped policies.
- Added source-integrity hashes and a stale-registry check (`pnpm run verify:capability-registry`).
- Added pull-request secret scanning and made the release verification job depend on it.
- Enabled Linux MakerZIP in the Forge configuration because the release matrix packages Linux.
- Promoted high-impact catalog import and accounting-close creation routes to explicit permission checks, and aligned the existing territory, pricing, CRM, and UOM handler checks with their declared policies.
- Promoted existing direct-policy handlers for workspace snapshots, people projection, profile updates, delivery project/agreement creation, and workforce profile/availability/allocation creation so their runtime assertions match the manifest.
- Closed the remaining direct-policy/session-fallback mismatches for retail cutover and GST/place-of-supply routes; the alignment verifier now checks 329 permissioned handlers.
- Promoted project currency, contract variation, retainer, resource-plan, margin-review, and entitlement mutations to explicit scoped permissions.
- Promoted kernel workflow transitions and approval decisions to explicit `kernel.workflow:update` and `kernel.approval:approve` controls.
- Added `verify:ipc-policy-alignment` to the Retail Core gate so direct permissioned handlers cannot regress to generic session authorization.
- Added an AES-256-GCM encrypted backup envelope backed by the OS-protected master key. Electron-created backups now use `.epicbackup`; restore inspection and isolated restore drills authenticate/decrypt through temporary files and never accept unauthenticated ciphertext.
- Added the protected active-database lifecycle: on launch the Store Edge opens an encrypted persisted database into a runtime-only SQLite path (or migrates a legacy plaintext file), and on normal quit it seals the runtime file and removes runtime/WAL/SHM plaintext artifacts. Interrupted launches fail closed on corrupt runtime files and recover an intact runtime file rather than discarding it.

### Verification evidence

Commands were run from `outputs/epic-bos` on 2026-08-06:

| Gate | Result |
|---|---|
| `pnpm run generate:capability-registry` | PASS — 548 records written |
| `pnpm run verify:capability-registry` | PASS — registry current |
| focused IPC policy/projection tests | PASS — 2 files, 10 tests |
| `pnpm typecheck` | PASS |
| `pnpm --dir retail-hub typecheck` | PASS |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm test` | PASS — 235 files, 987 tests |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint` | PASS |

The follow-up authorization batch also passed:

| Gate | Result |
|---|---|
| capability registry regeneration/check | PASS — 538 declared, 538 classified; 548 records |
| IPC authorization policy tests | PASS — 1 file, 9 tests |
| `pnpm typecheck` after handler changes | PASS |
| `git diff --check` | PASS (only Git line-ending warnings) |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint` after handler changes | PASS |
| `pnpm --dir retail-hub test` | PASS — 15 files, 62 tests |
| post-handler promotion `pnpm typecheck` | PASS |
| post-handler promotion IPC policy/projection tests | PASS — 2 files, 11 tests |
| post-handler promotion `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint` | PASS |
| `pnpm run verify:ipc-policy-alignment` after cutover/GST promotion | PASS — 314 handlers checked |
| post-cutover/GST promotion `pnpm typecheck` | PASS |
| post-cutover/GST promotion IPC policy/projection tests | PASS — 2 files, 11 tests |
| current full root `NODE_OPTIONS=--max-old-space-size=4096 pnpm test` | PASS — 235 files, 988 tests |
| current capability-registry and handler-alignment checks | PASS |
| current `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint` | PASS |
| encrypted-backup envelope and restore-drill tests | PASS — 2 files, 4 tests |
| full root suite after encrypted-backup integration | PASS — 236 files, 991 tests |
| full lint after encrypted-backup integration | PASS |
| current focused authorization/projection tests | PASS — 2 files, 12 tests |
| current full root suite after commercial authorization promotion | PASS — 236 files, 992 tests |
| current full lint after commercial authorization promotion | PASS |
| current `pnpm run verify:ipc-policy-alignment` | PASS — 329 handlers checked |
| final kernel-control alignment check | PASS — 331 permissioned handlers checked |
| final full root suite after kernel-control promotion | PASS — 236 files, 992 tests |
| final full lint after kernel-control promotion | PASS |

### Protected database follow-up evidence

- `pnpm typecheck` — PASS after active-database integration.
- `pnpm exec vitest run src/main/protected-database-file.test.ts src/main/encrypted-file-envelope.test.ts src/main/backup-service.test.ts` — PASS, 3 files, 6 tests.
- `pnpm lint` — PASS after active-database integration.
- full root `NODE_OPTIONS=--max-old-space-size=4096 pnpm test` — PASS, 237 files, 994 tests.
- `pnpm --dir retail-hub typecheck` — PASS.
- `pnpm --dir retail-hub test` — PASS, 15 files, 62 tests.
- `pnpm run verify:capability-registry` — PASS.
- `pnpm run verify:ipc-policy-alignment` — PASS, 331 permissioned handlers checked.
- `git diff --check` — PASS (only Git line-ending warnings).
- `pnpm build` — PASS; Electron Forge produced the Windows x64 packaged application with the protected-database startup/shutdown code bundled.
- Added statutory adapter credential generations. Prepared IRP/GSP operations and consolidated e-way bills now record the credential revision used to prepare them and fail closed after credential rotation; unchanged fingerprints do not create needless revisions.
- `pnpm exec vitest run src/domain/statutory-control.test.ts src/main/revenue-ops-store.test.ts src/main/retail-commerce-execution.test.ts` — PASS, 3 files, 44 tests after statutory credential-generation binding.
- full root `NODE_OPTIONS=--max-old-space-size=4096 pnpm test -- --reporter=dot` — PASS, 237 files, 995 tests.
- `pnpm build` — PASS after statutory credential-generation binding; Windows x64 Electron package rebuilt.
- Promoted 20 previously delegated IPC channels to explicit, scope-aware permissions: restore drills, certification exports, communication delivery, unified-order picking/dispatch, commission payouts, inter-branch creation, and catalog/device operations.
- `pnpm run verify:ipc-policy-alignment` — PASS, 351 permissioned handlers checked; the registry now has 180 remaining delegated-record-bound channels.
- focused IPC policy/projection tests — PASS, 2 files, 13 tests.
- full root `NODE_OPTIONS=--max-old-space-size=4096 pnpm test -- --reporter=dot` — PASS after the authorization batch.
- `pnpm build` — PASS; Windows x64 Electron package rebuilt with the promoted IPC manifest.
- full root `NODE_OPTIONS=--max-old-space-size=4096 pnpm test -- --reporter=dot` — PASS after the commerce/OCR and statutory/provider authorization batches.
- `pnpm build` — PASS; Windows x64 Electron package rebuilt after all authorization batches.
- Promoted the next 24 IPC channels covering purchase OCR, commerce connectors/sync, settlement allocation, conflict resolution, and OCR provider controls to exact permission policies.
- `pnpm run verify:ipc-policy-alignment` — PASS, 375 permissioned handlers checked; 156 delegated-record-bound channels remain.
- policy/projection tests — PASS, 2 files, 13 tests; typecheck and lint — PASS.
- Promoted 24 statutory and provider gateway channels to exact policies, aligned with credential-vault and credential-generation controls.
- `pnpm run verify:ipc-policy-alignment` — PASS, 399 permissioned handlers checked; 132 delegated-record-bound channels remain.
- policy/projection tests — PASS, 2 files, 13 tests; typecheck and lint — PASS.

### Latest authorization batch

- Promoted 32 collections, withholding/bank reconciliation, and treasury channels to exact permission policies. Active scopes on finance/treasury routes are normalized to `revenue-operations-bound` by the route classifier, preserving the existing response-projection boundary.
- `pnpm run generate:capability-registry` / `pnpm run verify:capability-registry` — PASS; 548 capability records current.
- `pnpm run verify:ipc-policy-alignment` — PASS, 431 permissioned handlers checked; 100 delegated-record-bound channels remain.
- Policy/projection tests — PASS, 2 files, 14 tests; `pnpm run typecheck` — PASS; `pnpm run lint` — PASS.
- Full root suite — PASS, 237 files, 997 tests.
- `pnpm build` — PASS; Electron Forge rebuilt the Windows x64 package with the collections/finance/treasury authorization manifest.
- Promoted 17 offline POS and omnichannel order channels (offline sale queue, unified-order ingestion/handoffs, stock reservation, delivery/RTO/return reconciliation, and carrier callbacks) to explicit sales/inventory permissions.
- `pnpm run generate:capability-registry` / `pnpm run verify:capability-registry` — PASS; `pnpm run verify:ipc-policy-alignment` — PASS, 448 permissioned handlers checked; 83 delegated-record-bound channels remain.
- Policy/projection tests — PASS, 2 files, 15 tests; `pnpm run typecheck` — PASS; `pnpm run lint` — PASS.
- `pnpm build` — PASS; Windows x64 Electron package rebuilt with the offline/omnichannel authorization manifest.
- Promoted 20 exchange, credit-note, inter-branch, marketplace push, catalog mapping, conformance, and purchase-exception channels to explicit permission policies.
- `pnpm run generate:capability-registry` / `pnpm run verify:capability-registry` — PASS; `pnpm run verify:ipc-policy-alignment` — PASS, 468 permissioned handlers checked; 63 delegated-record-bound channels remain.
- Policy/projection tests — PASS, 2 files, 16 tests; `pnpm run typecheck` — PASS; `pnpm run lint` — PASS.
- `pnpm build` — PASS; Windows x64 Electron package rebuilt with the exchange/omnichannel authorization manifest.
- Promoted 29 payroll/workforce channels (registration, policies, compensation, benefits, payroll runs, expenses, attendance, leave, adjustments, tax declarations, and payslips) to explicit permission policies.
- `pnpm run generate:capability-registry` / `pnpm run verify:capability-registry` — PASS; `pnpm run verify:ipc-policy-alignment` — PASS, 497 permissioned handlers checked; 34 delegated-record-bound channels remain.
- Policy/projection tests — PASS, 2 files, 17 tests; `pnpm run typecheck` — PASS; `pnpm run lint` — PASS.
- Full root suite — PASS, 237 files, 1,000 tests.
- `pnpm build` — PASS; Windows x64 Electron package rebuilt with the final static Phase 0 authorization manifest.
- Added migration `025-attachment-operating-scope`; new encrypted attachments carry company/branch ownership and scoped list/get/export queries fail closed for another tenant or branch. Legacy unscoped rows are intentionally not returned through scoped IPC routes.
- Added protected database key rotation: sealed database only, authenticated re-encryption into a temporary envelope, integrity verification, atomic swap with rollback on failure, and removal of the previous encrypted copy.
- Scoped attachment, migration, and key-rotation tests — PASS, 3 files, 26 tests; typecheck/lint — PASS.
- Capability registry/alignment — PASS, 548 records and 528 permissioned handlers.
- Full root suite after scope/rotation changes — PASS, 237 files, 1,002 tests.
- `pnpm build` — PASS; Windows x64 Electron package rebuilt with migration 025 and protected-key rotation support.
- Added machine-readable runtime encryption evidence and a release-deployment check. Current `node:sqlite` builds report `interim-persisted-envelope`; deployment readiness now stays `hold` until native encrypted SQLite evidence is supplied.
- Runtime-security and release-readiness tests — PASS, 2 files, 6 tests; full root suite — PASS, 238 files, 1,005 tests.
- `pnpm build` — PASS; Windows x64 Electron package rebuilt with the runtime-encryption release gate.
- Recorded ADR-005 documenting the native encrypted SQLite decision, cross-platform driver constraint, and the evidence required before removing the release hold.
- Added a corruption-recovery drill proving a damaged stale runtime fails closed even when a valid encrypted persisted database exists; the persisted envelope remains intact for incident recovery.
- Protected-database tests — PASS, 4 tests including recovery, rotation, old-key rejection, and corrupted-runtime fail-closed behavior.
- Retail Hub verification — PASS, typecheck plus 15 files / 62 tests; Hub remains read-only and credential-free until real Bakaloo provider credentials and approved cutover evidence exist.
- `pnpm build` — PASS; Windows x64 Electron package rebuilt with the payroll/workforce authorization manifest.
- Promoted the final static authorization surfaces: password change, ledger company binding, stock/shipment/return operations, carrier configuration, target-margin pricing, financial billing/period decisions, and all kernel administration channels.
- `generalLedgerBindCompany` now uses `assertGeneralLedgerAuthorized` before validating the requested company/branch binding; generic authentication fallback is removed.
- `pnpm run generate:capability-registry` / `pnpm run verify:capability-registry` — PASS; `pnpm run verify:ipc-policy-alignment` — PASS, 528 permissioned handlers checked; only 3 dynamic attachment channels remain delegated by design.
- Policy/projection tests — PASS, 2 files, 17 tests; `pnpm run typecheck` — PASS; `pnpm run lint` — PASS.

### Remaining Phase 0 gates

- Complete negative role and cross-tenant tests for the 3 remaining dynamic attachment channels; their resource is selected from a validated target/verified encrypted metadata and therefore cannot be represented by one static resource without weakening record-level authorization.
- Keep the protected-database crash/power-loss drill in the release regression set; controlled key rotation, encrypted migration, stale-runtime recovery, and WAL recovery are now covered by automated tests.
- Replace the interim runtime-plaintext window with native SQLCipher or an equivalent encrypted SQLite runtime before claiming full production-grade database encryption. The current lifecycle protects the persisted file during normal operation but cannot protect memory/runtime pages or a machine killed while the app is open.
- Deploy the Retail Hub runtime with tenant/outlet isolation, durable sync, outbox/idempotency, and credential vault controls.
- Remediate and certify the separate Bakaloo backend/dashboard seams (Socket.IO room authorization, raw Razorpay body verification, strict session/permission defaults, refund contract, removal of fabricated MFA/map states, and the cookie-only dashboard auth transport). The browser dashboard now calls server-enforced encrypted-TOTP MFA setup, challenge, recovery and disable routes; its rider map rejects fabricated centers and stale/unverified coordinates. Production migration/deployment, CSRF/session policy, provider consent/provenance, and browser UAT evidence remain open.
- Run real-data shadow import/reconciliation and obtain provider/device credentials before any write-back or live cutover.

## Exit rule

Phase 0 may advance only when the remaining gates have reproducible evidence. Passing local tests alone must never be represented as live production readiness.

### Native runtime selection boundary

- Added `src/main/runtime-database-driver.ts`, an explicit native-encrypted
  driver contract and selection boundary. A future SQLCipher/equivalent
  provider must identify itself and return `native-encrypted` evidence with a
  matching driver id; malformed, interim, or throwing probes fail closed as
  `unknown` rather than silently selecting `node:sqlite`.
- Runtime driver-selection tests â€” PASS, 4 tests; existing runtime-security
  evidence test â€” PASS.
- `pnpm run typecheck` â€” PASS; `pnpm run lint` â€” PASS.
- Full root suite â€” PASS, 239 files, 1,009 tests.
- Retail Hub â€” PASS, typecheck plus 15 files / 62 tests.
- Capability registry and IPC alignment â€” PASS, 548 records and 528
  permissioned handlers.
- `pnpm build` â€” PASS; Windows x64 Electron package rebuilt.

The active application still has no certified native driver registered, so its
truthful evidence remains `node:sqlite` / `interim-persisted-envelope` and the
production deployment gate remains on hold.

### Packaged UI and durability certification evidence

- The first packaged run exposed a stale E2E assumption: the protected
  lifecycle correctly removed the plaintext SQLite path, while the proof
  still opened that old path. The test harness now uses a test-only,
  `EPIC_BOS_E2E`-gated Electron helper to decrypt the sealed copy with the
  same OS-protected key into a disposable proof database. Production shutdown
  behavior is unchanged.
- Packaged owner bootstrap/restart journey - PASS; real preload, IPC, SQLite
  migration 025, clean-workspace guard, sign-in, and restart evidence passed.
- Packaged POS checkout/restart journey - PASS; real pointer/keyboard input,
  scroll-to-control behavior, hit-test diagnostics, GST/tender/stock/cost
  persistence, balanced cost journal, receipt visibility, and restart evidence
  passed.
- Evidence output: `tmp/e2e-evidence3/owner-bootstrap-restart/` and
  `tmp/e2e-evidence3/pos-checkout-restart/` (disposable local artifacts).

Final regression after the E2E harness correction:

- Root suite - PASS, 239 files / 1,009 tests.
- Retail Hub - PASS, 15 files / 62 tests.
- TypeScript, lint, capability registry, IPC alignment, and `git diff --check` - PASS.

### Packaged retail navigation certification

- Added `e2e/electron/retail-navigation.e2e.ts` to exercise the visible retailer
  rail through the packaged Electron app. The journey enrolls an owner through
  the real UI, verifies all eight plain-language workspaces, checks that the
  `.main-content` scroll owner is available (without mistaking the intentionally
  locked document frame for a scroll trap), expands each workspace, and opens a
  representative submodule.
- Verified Home, Sell, Stock, Deliver, Customers, Money, Insights, and Setup,
  including Overview, Point of sale, Products & variants, Order queue, Customer
  360, Cash register, Executive dashboard, and Stores & users. Renderer error
  capture remained empty.
- The same journey also verifies each submodule acknowledgement in the visible
  status surface, proving the labels are wired actions rather than decorative
  menu items. Packaged navigation journey - PASS; 1 file / 1 test, 51.96 seconds.
- Evidence output: `tmp/e2e-evidence-navigation5/` (disposable local artifacts).

### Protected database power-loss drill

- Added a child-process WAL drill to
  `src/main/protected-database-file.test.ts`. The child writes a committed
  marker, keeps the WAL-backed runtime open, and is terminated before normal
  sealing. The next `prepareRuntime()` recovers the orphan runtime, reads the
  committed marker, and passes `PRAGMA integrity_check`.
- Protected database file suite - PASS; 1 file / 5 tests, including the new
  simulated power-loss recovery case.
- This is reproducible crash-recovery evidence for the local runtime lifecycle;
  it does not remove the separate native encrypted SQLite production gate.

### Regression after navigation and recovery changes

- Root suite - PASS, 239 files / 1,011 tests.
- TypeScript, lint, and `git diff --check` - PASS.

### Dynamic attachment authorization evidence

- Added explicit manifest assertions for all three dynamic attachment IPC
  channels: list, add, and export remain delegated and cannot silently inherit
  a static or session-only permission.
- Added role-denial coverage for a limited user versus an owner on the
  attachment-backed CRM resource, plus same-company/different-branch and
  cross-company vault isolation checks for list, get, and export.
- Targeted authorization/vault/kernel regression - PASS; 3 files / 27 tests.

### Retail Hub local HTTP boundary

- Added `retail-hub/src/node-http-adapter.ts`, a dependency-free Node HTTP
  adapter around the durable shadow-import service. It does not start a
  listener automatically, open a database, read credentials, or trust
  renderer-provided scope. A deployment must inject trusted authorization;
  absent that context, protected routes return `403`.
- Review requests are bounded to a configurable 1 KiB–1 MiB JSON body, with
  explicit `413` (too large), `415` (non-JSON), and `400` (malformed JSON)
  responses before service dispatch. The response boundary adds `nosniff` and
  no-store headers and preserves the service's read-only `405` behavior.
- Node adapter contract tests - PASS; 16 Retail Hub files / 65 tests.
- Retail Hub typecheck - PASS; this is a local deployment seam only. Fastify,
  PostgreSQL/Redis, TLS, auth, observability, and real Bakaloo credentials
  remain future production gates.

### Retail Hub deployment readiness gate

- Added `retail-hub/src/deployment-readiness.ts` with a value-free release
  evaluator for explicit origins, trusted authentication, TLS, PostgreSQL,
  Redis, credential vault, observability, backups, and shadow/parallel-run
  source mode. `write-enabled` is always held for the separate cutover gate.
- The evaluator performs no network, database, or secret access and cannot
  claim live Bakaloo connectivity. Its assertion helper fails closed with only
  check identifiers, never configuration values.
- The production check now also requires an explicit database RLS-context flag,
  tying deployment readiness to the transaction wrapper used by the repository.
- Retail Hub verification - PASS; 17 files / 73 tests. Retail Hub typecheck,
  root lint, and diff check remain green.
- Final control checks after this milestone - PASS: root TypeScript, capability
  registry (548 records), and IPC alignment (528 permissioned handlers).

### Durable Hub database isolation hardening

- Strengthened `shadowImportPostgresSchema`: all three shadow tables now use
  `FORCE ROW LEVEL SECURITY` plus explicit `USING`/`WITH CHECK` policies bound
  to transaction-local tenant/company/branch settings. Missing settings match
  no rows, and the migration never trusts renderer scope.
- Schema regression now checks all three forced policies and every scope
  setting in both read and write predicates. Retail Hub verification remains
  green at 17 files / 73 tests.
- `ShadowImportSqlClient.withScope` is now honored by repository and review
  store queries, giving a real pool adapter a transaction-local RLS context.
  `createRlsScopedSqlClient` provides a fail-closed adapter: direct unscoped SQL
  rejects, while parameterized `set_config(..., true)` runs inside the pool
  transaction before the scoped operation. Invalid scopes are rejected before
  a transaction opens. Focused tests prove both behaviors.

### Retail Hub deployment configuration boundary

- Added `retail-hub/src/deployment-config.ts` to map a server-side environment
  into the deployment readiness contract. Unsupported enum values, malformed
  booleans, and missing required control flags are recorded as invalid keys
  and default to conservative hold values; the parser does not contact a
  database or connector and does not log secrets.
- Added three parser contract tests for a valid production shadow
  configuration, missing controls, and malformed values. Retail Hub
  verification is green at 18 files / 76 tests.
- Full regression after the boundary - PASS: 239 files / 1,011 tests; root
  TypeScript and ESLint remain green.

### Packaged UI usability follow-up

- Extended `e2e/electron/retail-navigation.e2e.ts` to drive the real Ctrl/Cmd-K
  keyboard shortcut, verify command-palette focus, exercise a 700px viewport,
  assert no horizontal overflow, and open/close the mobile workspace rail with
  its `aria-modal` contract. The `.main-content` element remains the sole
  vertical scroll owner.
- Packaged UI navigation/usability journey - PASS; 1 file / 1 test,
  219.96 seconds. The sweep opened all 31 retail submodule actions and 45
  observed workspace shortcut actions; every shortcut destination retained
  labelled visible controls and the single scroll-owner contract. No visible
  unlabeled controls or renderer errors were observed.
- Evidence output: `tmp/e2e-evidence-navigation27/` (disposable local artifact).
- The catalog device handoff selectors now use explicit `Certified printer`
  and `Label run` labels, removing the last controls found by this packaged
  accessibility sweep. The package used for this run was rebuilt from source
  with revision `ui-certification-2026.08.06.1`.
- The independent role-based follow-up is now explicit in
  `docs/phase-0/RETAIL_UI_UAT_CHECKLIST.md`, covering cashier, store manager,
  finance/controller, HQ administrator, accessibility, recovery, and evidence
  sign-off. This checklist is open until an independent tester records results.

### Current packaged critical journeys

- Owner bootstrap/restart - PASS; 1 file / 1 test on package revision
  `ui-certification-2026.08.06.1`. The real preload, IPC, SQLite migration,
  clean workspace provisioning, graceful close, second-process relaunch, and
  visible sign-in path completed successfully. Evidence output:
  `tmp/e2e-evidence-owner-current/`.
- POS checkout/restart - PASS; 1 file / 1 test on the same package. The
  rendered POS completed a real INR cash sale, persisted its stock/sale
  evidence to SQLite, closed, relaunched, and displayed the receipt again.
  Evidence output: `tmp/e2e-evidence-pos-current/`.

### Independent cash-close packaged journey

- The packaged POS journey now proves two-person cash custody end to end on an
  isolated temporary profile: cashier `user-avery` completes an INR 118 cash
  sale, explicitly declares every tender rail, submits drawer evidence for
  independent review, and closes; reviewer `user-priya` rotates the temporary
  credential through the real password-change gate, signs in again, records
  review evidence, and approves the shift close.
- SQLite proof verifies the cash receipt is `reconciled`, the shift is
  `closed`, `closedBy` is the independent reviewer, and variance is zero.
- Packaged journey - PASS; 1 file / 1 test on the unsigned package revision
  `ui-certification-2026.08.06.1`. Evidence output:
  `tmp/e2e-evidence-pos-cash-close-final10/`.
- The journey exposed and fixed a real authorization defect: the authenticated
  password-change route is self-bound to the active token and is now explicitly
  delegated. The isolated reviewer fixture uses a dedicated shell-read role
  plus the finance-approver role because the renderer currently preloads all
  read snapshots before opening a workbench; least-privilege renderer boot for
  restricted roles remains a follow-up.
- This is packaged local evidence only. Return/exchange, packaged offline
  recovery, independent human UAT, live Hub deployment, provider/device
  certification, signing, and controlled Bakaloo cutover remain open.

Verification after the cash-close work: root TypeScript and ESLint pass;
full Vitest suite passes **239 files / 1,012 tests**. The packaged POS cash-close
journey remains **1/1 green** on the unsigned `ui-certification-2026.08.06.1`
executable.

### Packaged counter-return + cash-close journey (2026-08-06)

- Added receipt selection, counter-return request, physical inspection,
  eligible-bin classification, condition evidence, independent approval, and
  cashier/reviewer close to the same disposable packaged profile.
- Fixed two real interaction defects found by the journey: async return-form
  reset now retains a stable form node, and long-form label resolution reads a
  label's own caption separately from the textarea value.
- The isolated reviewer fixture now includes the required inventory approval
  grant in addition to sales approval; this is disposable E2E setup only.
- SQLite proof confirms approved return evidence, independent actors, restored
  stock, return inventory ledger evidence, and a balanced return-cost journal.
- Packaged verification: **1/1 passed** using
  `out/Epic BOS-win32-x64/epic-bos.exe`; evidence:
  `tmp/e2e-evidence-pos-return-final/`.

### Packaged offline-store recovery journey (2026-08-06)

- Added a real Electron journey for secure offline queueing, graceful close,
  restart, queued-sale visibility, governed synchronization, and a second
  restart with the completed receipt visible.
- Read-only protected SQLite proof verifies the queue status, one sync attempt,
  `queued`/`syncing`/`synced` journal events, completed sale evidence, and
  counter-bin stock reconciliation.
- Packaged verification: **1/1 passed** in 31 seconds with no renderer errors.
  Evidence is at `tmp/e2e-evidence-offline-recovery/offline-recovery/`.
- Focused offline/domain/renderer tests: **12 passed**; TypeScript and ESLint
  remain green.
- This is local restart/recovery evidence, not a claim of real power-loss,
  multi-terminal conflict, hardware, live Hub, provider, or production UAT
  certification.

### Packaged offline-conflict recovery journey (2026-08-06)

- Added a real Electron conflict path: checksum drift is surfaced as an
  explicit conflict, the cashier is shown that self-resolution is forbidden,
  and an independent supervisor must provide recovery evidence.
- The supervisor completes the temporary-password rotation, enters
  `POWER-FAIL-STORE-001`, and discards the conflicted queue item. The protected
  SQLite proof records `queued`, `syncing`, `conflict`, and `discarded` journal
  transitions and confirms no sale was posted.
- Packaged verification: **1/1 passed** in 40 seconds with no renderer errors.
  Evidence is at `tmp/e2e-evidence-offline-conflict/offline-conflict-recovery/`.
- This is local packaged evidence only; physical power-loss, multi-terminal,
  provider/device, live Hub, signing, and independent human UAT gates remain.

### Store Edge → Hub offline sync boundary (2026-08-06)

- Added a fail-closed `store-edge:sync` HTTP seam with trusted scope and
  authorization, bounded JSON, SHA-256 payload binding, secret-like key
  rejection, idempotent replay handling, transaction-key drift conflicts, and
  stale sequence detection.
- The scope-bound receipt route is read-only evidence. No order, stock,
  payment, GST, Bakaloo, or Electron business state is mutated by this seam.
- Retail Hub verification: **19 files / 83 tests**; root TypeScript and ESLint
  remain green. The in-memory inbox is deliberately local-only until a
  production PostgreSQL inbox/outbox, retry/lease, backup, deployment, and
  real Store Edge integration are certified.

### Durable Store Edge sync repository and RLS migration (2026-08-06)

- Added the injected PostgreSQL repository for Store Edge events and append-only
  receipts, with scoped lookup, idempotency, transaction-key drift detection,
  stale sequence protection, and transaction-local RLS wrapping.
- Added two RLS-forced tables to the Hub migration contract. No pool is opened,
  no renderer scope is trusted, and no business record is mutated by this
  repository boundary.
- Retail Hub verification: **20 files / 86 tests**; root TypeScript and ESLint
  remain green. A live PostgreSQL migration/rollback drill and durable worker
  lease/retry evidence are still required.

### Store Edge sync worker leases and retry policy (2026-08-06)

- Added bounded worker claim, lease expiry reclaim, completion, retry/backoff,
  and dead-letter semantics for Store Edge sync work.
- Added the PostgreSQL `FOR UPDATE SKIP LOCKED` claim/update adapter and an
  RLS-forced `retail_store_edge_sync_work` migration table. Work cannot be
  completed or retried without the active unexpired worker lease.
- Retail Hub verification: **22 files / 94 tests**; root TypeScript and ESLint
  remain green. A live transaction-pool drill, worker process, metrics,
  backup/restore, and production deployment are still required.

### Store Edge sync worker runtime and metrics (2026-08-06)

- Added a bounded run-once runtime with injected event processing, successful
  lease completion, retry/dead-letter reporting, and cumulative metrics. It
  deliberately does not start an unbounded process inside Electron.
- Retail Hub verification: **23 files / 98 tests**; root TypeScript and ESLint
  remain green. Deployed worker operations, real metrics, transaction-pool
  execution, backup/restore, and incident runbooks remain open.

### Store Edge operations deployment gate (2026-08-06)

- Added fail-closed readiness checks for the deployed Store Edge worker,
  exported queue metrics, and current backup/restore plus conflict-recovery
  evidence.
- Added three explicit environment inputs: 
  `RETAIL_HUB_STORE_EDGE_WORKER_CONFIGURED`,
  `RETAIL_HUB_STORE_EDGE_METRICS_CONFIGURED`, and
  `RETAIL_HUB_STORE_EDGE_RECOVERY_CONFIGURED`. The configuration reader
  returns missing/malformed keys separately and never turns them on by
  default.
- Verification remains **23 files / 98 tests** in the Hub; this does not claim
  a deployed worker, metrics destination, live PostgreSQL, recovery drill, or
  production certification.

### Store Edge worker metrics observation boundary (2026-08-06)

- Added an authenticated, read-only `GET /v1/store-edge/worker/metrics` route
  with dedicated `store-edge:observe` permission and trusted scope binding.
- The adapter returns `503` until a server-owned scope-bound metrics provider
  is injected, and never exposes process-global totals or accepts renderer
  scope. It cannot start workers or mutate business state.
- Hub verification: **23 files / 99 tests**; root TypeScript and ESLint remain
  green. Metrics infrastructure, deployed worker operations, and production
  authentication remain external deployment gates.

### Capability registry drift correction (2026-08-06)

- The registry drift check found stale generated records; it was regenerated
  from the current IPC declarations.
- `CAPABILITY_REGISTRY.json` now contains **548 records** and is current.
  The default-deny IPC alignment check passes for **527 permissioned handlers**.
- The registry remains an evidence index; it does not imply external
  certification, device readiness, live Hub deployment, or human UAT.
- The current status distribution is **528 LOCAL_ONLY, 15 PARTIAL, 4 BLOCKED,
  1 PLANNED**. External Bakaloo backend/dashboard items stay blocked until
  their provider and security contracts are actually implemented and tested.

### Retail Hub shadow-import preflight gate (2026-08-06)

- Added a pure preflight gate for shadow-import review. It requires a ready
  deployment, explicit trusted scope, verified checksum, reconciled counts,
  zero open conflicts, matching credential generation, and `writeBackAllowed:
  false`.
- The result is deliberately `ready-for-review`, not `cutover-ready`; it
  authorizes no external or business-record write.
- Hub verification: **24 files / 103 tests**; root TypeScript and ESLint remain
  green. Live credentials, PostgreSQL execution, and independent review remain
  external gates.

### Full application regression after shadow preflight (2026-08-06)

- Full root Vitest completed **239 files / 1,012 tests passed** after the
  authenticated preflight route was added. Root TypeScript and ESLint remain
  green.
- The result is local regression evidence only; provider, device, live Hub,
  human-UAT, and controlled-cutover gates remain open.

### Machine-readable deployment preflight artifact (2026-08-06)

- Added `createRetailHubDeploymentPreflight` for CI/control-room use. The
  report contains no configuration values or secret material, only status,
  checks, invalid key names, blockers, timestamp, and the immutable
  `writeBackAllowed: false` flag.
- Hub verification: **25 files / 106 tests**; root TypeScript and ESLint remain
  green. Missing infrastructure, live credentials, provider evidence, and
  independent review continue to hold production.

### Authenticated deployment readiness route (2026-08-06)

- Added protected read-only `GET /v1/deployment/preflight` to expose the same
  server-owned deployment checks to a control room without returning any
  configuration values.
- Unconfigured deployments return `503`; every response retains
  `writeBackAllowed: false`. No worker, source connector, or business mutation
  is started by the route.
- Hub verification remains **25 files / 106 tests**; root TypeScript and ESLint
  pass.

### Retail command-centre visual consistency pass (2026-08-06)

- Replaced platform-dependent emoji quick actions with consistent Lucide icon
  components in the India executive dashboard and corrected three mojibake
  device-status separators.
- Targeted command-centre/device renderer tests (**10 tests**), root
  TypeScript, and ESLint pass. This improves local UI consistency but does not
  replace required human UAT or cross-platform packaged visual certification.

### Verified Windows package for the UI milestone (2026-08-06)

- Rebuilt version **0.1.77** and verified the local artifact at
  `out/Epic BOS-win32-x64/epic-bos.exe`.
- Packaged smoke launch returned `EPIC_BOS_SMOKE_OK`. Signing, notarisation,
  macOS/Linux packages, and independent visual acceptance remain open.
- Added and passed `pnpm run verify:renderer-copy`, now included in the retail
  core verification command to prevent future renderer encoding regressions.

### Packaged retail navigation certification (2026-08-06)

- `retail-navigation.e2e.ts` passed against the rebuilt Windows executable in
  **220.3 seconds** with no renderer errors.
- It verified 8 primary workspaces, 31 left-rail submodules, 42+ shortcut
  handoffs, scrolling/overflow ownership, accessible controls, command palette,
  narrow layout, and the navigation drawer. Human UAT and cross-platform
release evidence remain separate gates.

The owner-bootstrap/restart journey also passed against the same packaged
revision, proving a clean owner workspace survives the real preload, IPC,
SQLite protection, and a second app process after the keyring-proof helper
update.

## Retail-core gate after packaged recovery fixes (2026-08-08)

`pnpm run verify:retail-core` is green: capability registry current, **537**
permissioned IPC handlers aligned, renderer encoding check passed, root
TypeScript passed, **246 files / 1,057 tests passed**, Retail Hub typecheck and
**27 files / 126 tests** passed, and ESLint passed. This is the complete local
source gate; the release remains held for native SQLCipher or equivalent
runtime encryption, live Hub infrastructure, provider/device credentials,
macOS/Linux native smoke and signing, and independent human UAT.

### Windows distributables and release-verifier alignment (2026-08-06)

- Generated version **0.1.77** Windows Squirrel setup and full package.
- Aligned the standalone artifact/smoke verifiers with the canonical immutable
  Git-SHA or `ci-*` revision policy. Artifact verification passes for 2
  distributables and smoke evidence passes against all 3 manifests.
- The artifacts are unsigned local builds; signing, macOS/Linux, provider,
  device, and production approval gates remain open.

### Hub readiness surfaced in the Store Edge control room (2026-08-06)

- Added a permission-gated, read-only IPC seam for the authenticated Hub
  deployment preflight route. The main process validates HTTPS URL boundaries
  and response schema; the renderer receives no secrets and cannot enable
  write-back.
- Added the `Check Hub readiness` control to the cutover guard panel, showing
  only server-owned checks, environment, blockers, and the explicit
  `writeBackAllowed: false` status.
- Targeted coverage is **9 tests**; full root regression is **240 files / 1,016
  tests**. The registry has **549 records**, IPC alignment covers **528
  permissioned handlers**, and Retail Hub verification is **25 files / 106
  tests**.
- This milestone does not claim live infrastructure or external certification;
  real deployment, credentials, provider/device evidence, recovery drills, and
  human UAT remain required before cutover.

### Retail-core milestone gate re-run (2026-08-06)

- `pnpm run verify:retail-core` completed successfully: registry and IPC
  alignment, renderer-copy guard, both TypeScript projects, **240 / 1,016 root
  tests**, **25 / 106 Hub tests**, and ESLint all pass.
- Version **0.1.77** Windows setup/full-package artifacts were regenerated,
  hash-verified, and smoke-launched. They are unsigned local artifacts; no
  external provider or production cutover claim is made.

### Final packaged navigation recheck (2026-08-06)

- The exact regenerated Windows executable passed the isolated packaged
  navigation journey in **219.4 seconds**, covering primary workspaces,
  submodule routing, renderer errors, scroll ownership, keyboard access, narrow
  layout, and the mobile drawer.

### Server-owned shadow-import readiness seam (2026-08-06)

- Added the read-only Hub shadow-import preflight transport through the main
  process, typed preload contract, and `release.control:read` policy. The
  renderer sends only a credential-free HTTPS base URL and the preview batch
  ID; no secret or write-back control crosses the boundary.
- The local Bakaloo JSON preview now exposes `Check Hub import readiness` and
  renders only server-owned checks/blockers. It cannot import, sync, cut over,
  or mutate business records.
- Targeted client/UI coverage is **4 tests**. The capability registry is at
  **550 records** and IPC alignment checks **529 permissioned handlers**.

### Shadow-import readiness package gate (2026-08-06)

- Root regression completed at **241 / 1,020 tests**; Retail Hub at **25 / 106
  tests**. TypeScript, ESLint, renderer-copy, registry, and policy alignment
  all pass.
- Unsigned Windows v0.1.77 artifacts were regenerated, hash-verified, smoke-
  launched, and the exact executable passed packaged navigation in **220.2
  seconds**. External infrastructure and certification remain separate gates.

### Content-bound local build provenance (2026-08-06)

- Dirty local packages now receive a deterministic content-bound `ci-local-*`
  revision over shipped source/configuration instead of silently reusing the
  parent Git SHA. Documentation and evidence edits are excluded from the
  binary identity.
- The rebuilt v0.1.77 artifacts report
  `ci-local-9d0da4fbc62676fd7751b4baf6a8d800`; artifact and smoke manifests
  agree on this revision. It is an identifiable local build, not a signed
  production release.

### Current-source regression after provenance hardening (2026-08-06)

- Re-ran the current source after the build-identity change: **241 / 1,020
  root tests** and **25 / 106 Hub tests** passed, confirming that the
  content-bound revision resolver did not change application behavior.

### Current content-bound packaged navigation (2026-08-06)

- The exact executable carrying revision
  `ci-local-9d0da4fbc62676fd7751b4baf6a8d800` passed packaged navigation in
  **220.6 seconds**, covering primary workspaces, submodules, scroll/overflow
  ownership, keyboard routing, narrow layout and the mobile drawer.

### Connector health and pull-receipt evidence (2026-08-06)

- Added main-process clients and typed IPC for the Hub source-status and
  pull-receipt read routes. Secrets never enter the renderer; receipt scope is
  removed in the safe projection and every result retains
  `writeBackAllowed: false`.
- The shadow-import review panel now exposes `Check source health` and `Load
  pull receipts`, showing only connector status, credential generation,
  timestamps, receipt counts, page/record totals, and checksum prefixes.
- Targeted status/client/UI coverage is **8 tests** (3 client + 5 review-panel).
  Registry/policy alignment
  is **552 records / 531 permissioned handlers**.

### Connector evidence package gate (2026-08-06)

- Current regression is green at **242 / 1,024 root tests** and **25 / 106 Hub
  tests**; TypeScript, ESLint, renderer-copy, registry, and IPC alignment pass.
- Unsigned Windows v0.1.77 artifacts report
  `ci-local-be616a56c749e0c684235da4db160a39`; hashes/smoke evidence verify
  the package, and the exact executable passed packaged navigation in **220.1
  seconds**. Live credentials and provider certification remain external.

### Consolidated retail-core gate re-run (2026-08-06)

- `pnpm run verify:retail-core` completed in **194.4 seconds** with all gates
  green: **242 / 1,024 root tests**, **25 / 106 Hub tests**, TypeScript,
  ESLint, renderer-copy, registry, and **531** IPC policy handlers.
- The gate covers the current source tree only; live Hub credentials,
  provider/device certification, human UAT, and production cutover remain
  explicitly unclaimed.

### Credential-generation-bound certification evidence (2026-08-06)

- Certification exports now carry the active credential revision for every
  commerce connector, generic provider, and provider preflight row. Secrets and
  fingerprints remain excluded, while stale evidence after rotation remains
  visibly ineligible.
- Focused certification/integration/provider coverage is **17 / 17 tests**;
  the full gate remains **242 / 1,024 root tests** and **25 / 106 Hub tests**.

### Credential-bound certification package rebuild (2026-08-06)

- Unsigned Windows v0.1.77 artifacts were rebuilt at revision
  `ci-local-59fa5350372030797d4dc70623202930`; installer SHA-256 is
  `2b10e84e07249f9071ad194c5b4d70891e1b261de27c0857543c1e14e43da3df`.
- Artifact verification, `EPIC_BOS_SMOKE_OK`, smoke-evidence verification, and
  packaged navigation (**217.2 seconds**) passed. External provider/device
  certification and human UAT remain required.

### Independent certification-pack verification (2026-08-06)

- Added a main-process-only, read-only verifier for exported retail
  certification packs. Release control can open a JSON pack and validate its
  checksum, company/branch scope, summary counts, credential generations, and
  unresolved external gates without importing or mutating local records.
- The verifier rejects credential-like fields (including secrets, tokens,
  API keys, and fingerprints), malformed evidence, count mismatches, and any
  pack that claims production readiness while external gates remain open.
- Focused certification-pack coverage is **8 tests passed**. The consolidated
  source gate is **242 / 1,025 root tests**, **25 / 106 Hub tests**, with
  TypeScript, ESLint, renderer-copy, registry, and IPC alignment green.
- The capability registry now contains **553 records** with **532 permissioned
  IPC handlers** aligned.

### Independent-verification package rebuild (2026-08-06)

- Rebuilt unsigned Windows v0.1.77 artifacts at revision
  `ci-local-6b092b461c2eb79ced5b8539c30d30dd`.
- Installer SHA-256:
  `3da416b0eac942466f14b978b6d2e2178e4374d4174671b9f1132e548bf6f997`.
  Artifact manifests, immutable smoke evidence, and `EPIC_BOS_SMOKE_OK`
  all passed. The exact packaged executable passed retail navigation in
  **217.2 seconds**.
- No live credentials or Bakaloo/business records were added or written.

### Clean-workspace demo quarantine gate (2026-08-06)

- Renderer release checks reject retired Northstar/USD-era demo names in
  shipped UI files; explicit migration and test fixtures remain allowed.
- Packaged Electron navigation asserts that a fresh owner workspace contains
  no retired fictional records before exercising all eight retail routes, 31
  submodules, shortcut handoffs, keyboard palette, accessibility, responsive
  layout, and scroll ownership.
- Consolidated retail-core verification passed (**242 / 1,027 root tests**,
  **25 / 106 Hub tests**); unsigned Windows v0.1.77 artifact and smoke
  manifests passed; packaged navigation passed in **217.1 seconds** with no
  renderer errors or scroll traps.
- Installer SHA-256: `2dcb930a49defb180378d4e5f59a33b0f43f01f71206cea9ffc6fb89bcd8973b`.
  This is an unsigned local build; live provider/device certification and
  human UAT remain external gates.

### Independent provider-package verification (2026-08-06)

- Added a main-process-only, read-only verifier for provider handoff JSON.
  It recomputes the checksum, validates the derived sandbox/production
  readiness and missing-evidence list, rejects unknown or credential-like
  fields, and never imports the package.
- Release control now offers **Verify provider package** beside the retail
  pack verifier. Focused provider verification coverage is **5 tests passed**.
- The full source gate is **242 / 1,027 root tests** and **25 / 106 Hub tests**;
  the capability registry has **554 records** and **533 permissioned IPC
  handlers** aligned.

### Independent-verification package rebuild (2026-08-06)

- Rebuilt unsigned Windows v0.1.77 artifacts at revision
  `ci-local-23e801a5e8a571a0293fea78aa5e567d`.
- Installer SHA-256:
  `4238ea0ec19da5991d91da8a842b8b39ca66ed540302103b16bf21b7cb07f4f4`.
  Artifact manifests, immutable smoke evidence, and `EPIC_BOS_SMOKE_OK`
  passed. Packaged retailer navigation passed in **221.1 seconds**.
- No live credentials or Bakaloo/business records were added or written.

### Provider certification handoff capture (2026-08-06)

- Release control now exposes a governed provider handoff form for GSP/IRP,
  banking, payroll, messaging, and logistics providers. It records only
  contract/evidence references, accountable owners, test-case references, and
  independent approval metadata; it has no secret, token, password, or signed
  payload input.
- Exported handoffs remain redacted, checksum-backed, and explicitly blocked
  from production readiness until independent approval and production evidence
  are supplied. Renderer coverage for the form is **43 tests passed**.

### Provider-handoff package rebuild (2026-08-06)

- Source gate passed with **242 / 1,026 root tests** and **25 / 106 Hub tests**;
  TypeScript, ESLint, renderer-copy, registry, and IPC alignment remain green.
- Rebuilt unsigned Windows v0.1.77 artifacts at revision
  `ci-local-bf2b85a2d84bf7a2f862e1a751799d25`.
- Installer SHA-256:
  `71919fe7377a064125ba3afe3ea5a687ba6862e7bdb0b68c4a3b87c37b419016`.
  Artifact verification, immutable smoke evidence, and packaged retailer
  navigation (**217.2 seconds**) passed.
- No live credentials or Bakaloo/business records were added or written.
### Durable Store Edge → Hub transport evidence (2026-08-06)

- Added a main-process-only HTTPS client for completed POS sale events. The
  client validates the event checksum, rejects secret-like payload keys, keeps
  the base URL credential-free, bounds request/response sizes, and fails closed
  on non-200/202/409 responses or malformed receipts.
- Connected the IPC action to `RevenueOpsStore`. Each accepted, idempotent, or
  conflicted Hub response is persisted as an append-only local receipt; a
  timeout or provider rejection is persisted as `failed` and rethrown. A
  branch-local sequence cursor survives restart and records the last accepted
  event without copying sale or tender payloads into the journal.
- Added the POS “Retail Hub coordination” panel with an explicit HTTPS endpoint
  field, real-sale-only send controls, sequence/attempt evidence, and honest
  empty/unavailable states. No demo URL or fabricated Hub response is shown.
- Verification: targeted Store Edge/domain/store tests **16/16 passed**;
  TypeScript and ESLint remain green. A live authenticated Hub deployment,
  provider credentials, and independent parallel-run evidence remain open.

### Packaged sync milestone verification (2026-08-06)

- Retail core gate: **243 files / 1,034 root tests** and **25 Hub files / 106
  tests** passed; IPC registry/policy alignment, renderer-copy, TypeScript, and
  ESLint passed.
- Windows v0.1.77 installer rebuilt at immutable revision
  `ci-local-94206a8ecb93700c79b3260ea5177bf5`.
- Installer SHA-256:
  `e93bd8ebb983dfa1c2f7416ef8798d369391916507486151f1b20da3d85dcc3a`.
  Full nupkg SHA-256:
  `280a43e66d7581c1d60a4e1e724bdd9cbb6a3c3bed7053d8b6f540cdcb0c3625`.
- Packaged smoke evidence verified; packaged Electron E2E passed **5/5**
  journeys (navigation, POS restart, offline recovery, conflict recovery, and
  clean owner restart) with no renderer errors or scroll traps.

### Store Edge worker health evidence (2026-08-06)

- Added a typed, read-only `GET /v1/store-edge/worker/metrics` seam. The Hub
  response now includes an explicit `writeBackAllowed: false` marker and
  server observation time; the main-process client rejects unauthenticated,
  malformed, oversized, inconsistent, or write-back-claiming responses.
- Added release-control IPC authorization and a plain-language shadow-import
  panel action, **Check Store Edge worker**, showing completed, retryable, and
  dead-letter counts without exposing scope or credentials and without
  offering replay or mutation controls.
- Focused verification: **9 tests passed** across the client and renderer,
  plus **5 Hub node-adapter tests**; capability registry and **535** permissioned
  IPC handlers remain aligned. This is operational evidence only, not proof of
  an authenticated production deployment.

### Worker-health packaged build verification (2026-08-06)

- Full retail-core gate passed after the worker-health seam: registry/policy,
  renderer-copy, TypeScript, root tests, Hub tests, and ESLint all completed
  successfully.
- Windows v0.1.77 rebuilt at immutable revision
  `ci-local-fd5c101e14e061e5aa83703c12603821`.
- Installer SHA-256:
  `7a6ebbad7c1bf150e73620a7561d6bf1c61c0836dc6ef0e235e8c223c6ad69b7`.
  Full nupkg SHA-256:
  `c551700d5cefaa3bc389bd63df7679ca986a82d71dd9aee4ec6eba6c9280c31f`.
- Artifact manifests verify **2/2**; packaged smoke and Electron E2E passed
  (**5/5** journeys, no renderer errors or scroll traps). The build remains
  unsigned and does not claim live provider, device, or Hub deployment
  certification.

### Unified cancellation reconciliation milestone (2026-08-06)

- Added a governed cancellation close boundary for POS, website, app,
  WhatsApp, ONDC, and marketplace order envelopes. A local reviewer can close
  an authoritative `cancelled` source only with the current 64-character
  source checksum, separate stock-release/no-reservation evidence, and
  payment/wallet-reversal evidence.
- The boundary rejects stale source evidence, unresolved order conflicts,
  missing cancellation requirements, maker-self-approval, malformed evidence,
  and non-cancelled source states. It records an append-only execution,
  transitions the local order to `cancelled-reconciled`, and is idempotent on
  replay. It never calls a provider, mutates stock/payment/tax records, or
  fabricates a cancellation response.
- Added authenticated IPC/policy/bridge wiring and a plain-language inbox
  form. The UI captures only local evidence and deliberately offers no
  provider-side cancellation control.
- Full source gate passed: **244 root test files / 1,040 tests**, **25 Hub
  files / 106 tests**, TypeScript, ESLint, renderer-copy, capability registry,
  and IPC policy alignment all green. Focused cancellation coverage includes
  **19 domain tests** and **3 inbox UI tests**.

### Cancellation packaged build verification (2026-08-06)

- Rebuilt unsigned Windows v0.1.77 artifacts at revision
  `ci-local-8371c3742e45dcb3d16aa4304b659ec3`.
- Installer SHA-256:
  `8535be4440fa03df6e8b1e870855776a1fb5c838adc3f080f6dbb3895888cda6`.
  Full nupkg SHA-256:
  `96c5b621db8306495490164fbf478b328ab9ded1ccb81436d3b924eaffae0620`.
  Artifact manifests verify **2/2** and packaged smoke passed with
  `EPIC_BOS_SMOKE_OK`.
- The installer remains unsigned. Live Hub deployment, real provider/device
  credentials, independent parallel-run evidence, and full human UAT remain
  external production gates; no Bakaloo production write-back was performed.

### Packaged UI certification runner hardening (2026-08-06)

- The Electron E2E close helper now bounds the renderer `window.close()`
  request and falls back to deterministic child-process cleanup if Windows
  leaves the CDP close request pending. This is test-harness cleanup only; it
  does not bypass the application's normal shutdown, database sealing, or
  recovery behavior.
- The exhaustive navigation journey passed **1/1** in **222.6 seconds**.
  The official packaged suite passed **5/5** journeys in **453.7 seconds**:
  navigation, POS checkout/restart, offline conflict recovery, offline
  recovery, and owner bootstrap/restart. No renderer errors or scroll traps
  were reported.

### Final cancellation-build artifact verification (2026-08-06)

- Windows v0.1.77 rebuilt at revision
  `ci-local-8371c3742e45dcb3d16aa4304b659ec3`.
- Installer SHA-256:
  `b839aacaeb85204d3a5f20b02a872767ecedb490c500ba508b3036ef46f3e3ca`.
  Full nupkg SHA-256:
  `7dc024b2f6d1a54c96daa914b008a4438faab475e368e681ca66a5f4fcad70ea`.
  Artifact manifests verify **2/2** and packaged smoke passed with
  `EPIC_BOS_SMOKE_OK`.

### Windows release handoff pack (2026-08-06)

- Generated `out/release-certification/win32-0.1.77` from the current three
  artifact manifests and build-identity-bound smoke evidence.
- Pack SHA-256:
  `a267b29761ec3eb596602684c7c7dfb6234918638f4c74023c099e263ec441ab`.
  The pack correctly remains **hold** until signing, external provider/device
  certification, monitoring, and independent release approval are supplied.

### Packaged navigation certification evidence (2026-08-06)

- The navigation journey now emits a build-revision-bound
  `retail-navigation-certification.json` artifact with route, submodule,
  shortcut, renderer-error, and viewport-scroll observations.
- The final Windows package passed **1/1** in **259.4 seconds** across **8**
  primary workspaces, **31** submodules, and **45** shortcuts, with no
  renderer errors.
- The 700px responsive check passed with no horizontal overflow and a
  **5,967px / 736px** content-to-viewport scroll measurement. This evidence
  covers packaged automation only; human role/device acceptance remains open.
- Stable evidence copy:
  `out/e2e-certification/win32-0.1.77/retail-navigation-certification.json`,
  SHA-256
  `470af1642edda91a256b258bcc5f1be1197051599c6e61656e1ee3c4b9b7bec7`.

### Workspace-owner runtime authorization and corrected packaged certification (2026-08-07)

- Added the versioned `029-workspace-owner-runtime-authorization` migration.
  It leaves the immutable authorization-foundation migration untouched while
  giving the bootstrap owner explicit operational-health visibility and
  governed retail release-control access. Replay is idempotent, tampering fails
  closed, and non-owner users remain default-deny.
- Retail-core gate: **244 / 1,042 root tests** and **25 / 106 Hub tests** passed;
  TypeScript, ESLint, renderer-copy, capability registry, and IPC alignment are
  green. Authorization-focused tests pass **35/35**.
- Unsigned Windows v0.1.77 revision:
  `ci-local-34aa491ef32544e540928a40a448d740`.
- Installer SHA-256:
  `58226203aed6523b999329def4ef12935815810aadd08056bce5c765d425fd1e`;
  full nupkg SHA-256:
  `feda7dc6fd83b66d770c0012caff3b43267ee219407cbdb73b7f3091137c2367`.
  Artifact verification passed **2/2**.
- Corrected packaged navigation certification passed **1/1** in **251.2s**:
  8 routes, 31 submodules, 45 shortcuts, no renderer errors; desktop main
  scroll owner `overflow-y:auto` (2,938px / 707px), narrow 700px viewport
  without horizontal overflow (6,275px / 736px). Focused intelligence and
  maintenance route journeys passed **1/1** each.
- Stable evidence hash:
  `8d04e146c2a7329f940bc91cb9f12ed78837b852fcd2f6bc03daeb3a7b595f9`.
  Signing, real provider/device certification, monitoring, and human UAT
  remain external gates; no Bakaloo production data was written.
- Packaged smoke evidence was regenerated and verified against all three Windows
  manifests (`EPIC_BOS_SMOKE_OK`). Refreshed release pack:
  `out/release-certification/win32-0.1.77`, SHA-256
  `4ea89911d4fa5c5dd2830f932e7e3d39e2889f9c268633e678b5a6029a3c2f87`;
  go/no-go remains **hold** pending signing and external certification.

### Release-matrix integrity verifier (2026-08-07)

- Added `scripts/verify-release-matrix.mjs` (`pnpm verify:release-matrix`) to
  verify all artifact sidecars and reject mixed release-line metadata within a
  platform. The report requires explicit Windows, macOS and Linux rows and
  never treats the current runtime as evidence for another operating system.
- Running it against local v0.1.77 is correctly blocked: Windows is verified
  **3/3**, macOS is missing, and Linux is missing. The command exits non-zero
  with `artifactIntegrityStatus: blocked` and a next action for each absent
  native build.
- The result remains an integrity report, not a production release claim;
  signing, notarisation, provider/device certification, human UAT, monitoring,
  and independent approval remain separate gates.

### Linux unsigned artifact and partial native matrix (2026-08-07)

- Built an unsigned Linux x64 ZIP in isolated output `out/cross-linux` with
  revision `ci-local-cross-linux-20260807`.
- Artifact SHA-256:
  `7a1c58fba3d32aa23c99fa49bb6820dbebeeddec52c1e2666216f89d861210f5`;
  manifest SHA-256:
  `443b20f02de330b1768a817802e0d4793756928aab9755c10e99e774bb87a48c`.
  Linux `verify-release-artifacts` passed **1/1**.
- The combined matrix verifies Windows **3/3** and Linux **1/1**, while macOS
  remains missing. The Windows-host macOS attempt produced no artifact; native
  macOS packaging, launch, signing and notarisation remain CI-only evidence.

### Database and backup envelope key separation (2026-08-07)

- Runtime database and encrypted backup files now write namespace-separated
  v2 AES-256-GCM envelopes (`runtime-database` and `database-backup`). Existing
  v1 direct-key envelopes remain readable through an explicit dual-read
  resolver, so a rollback or restore does not silently lose access to prior
  evidence.
- The envelope rejects unknown/truncated versions and authenticates the version
  specific AAD before releasing plaintext. Protected database startup, normal
  shutdown, key rotation, backup creation, restore inspection, and isolated
  restore drills all use the version-aware boundary.
- Focused verification passed: encrypted envelope **3/3 files, 3 tests**;
  protected database **5 tests**; backup/restore **2 tests**; TypeScript clean.
  This is a local key-derivation and compatibility improvement only. Native
  SQLite page encryption, OS master-key retirement, backup-file inventory and
  rewrap, provider/device certification, and independent production approval
  remain open gates.

### Managed backup inventory and rewrap (2026-08-07)

- Added migration `027-backup-envelope-key-version` and key-version evidence
  to backup receipts. Backup administrators can run **Secure local backup
  files** from Storage; the main-process operation scans only the app-managed
  backup directory, classifies plaintext/v1/v2/invalid files, and atomically
  rewraps plaintext or v1 files into the active v2 namespace envelope.
- Each replacement is reopened and checked for SQLite integrity/schema before
  the previous file is removed. Invalid files remain visible in the receipt;
  backups saved outside the managed directory are not silently claimed as
  migrated.
- Focused verification passed: backup service **3/3 tests**, database migration
  suite **20 tests**, IPC alignment **537 handlers**, renderer-copy check, lint,
  and TypeScript. This does not provide native SQLite page encryption or OS
  master-key retirement.

### Store Edge lease fencing (2026-08-07)

- Added a per-lease fencing token to the Store Edge worker contract and
  PostgreSQL schema. Every claim generates a deterministic token bound to the
  work id, worker, expiry, and attempt; completion/retry now require the exact
  token and clear it on release.
- The in-memory and PostgreSQL repositories reject stale acknowledgements even
  when the same worker ID is reused after expiry. Existing tokenless leased
  rows fail closed rather than allowing an ambiguous completion.
- Hub verification passed **25 files / 110 tests** and TypeScript. Live
  PostgreSQL migration application, multi-worker recovery, and independent
  store coordination evidence remain external deployment gates.

### Store Edge inbox insert-race reconciliation (2026-08-07)

- Durable event insertion now uses `ON CONFLICT DO NOTHING RETURNING` and
  re-reads the authoritative event or transaction/sequence winner when a
  concurrent writer wins. The caller receives `idempotent` or `conflicted`
  evidence instead of a synthetic `recorded` response for an event that was
  not persisted.
- Receipt identifiers now use UUIDs, preventing same-event/same-timestamp
  collisions from returning a receipt that was never durable. The in-memory
  and PostgreSQL paths continue to validate checksums, sequence monotonicity,
  transaction keys, and tenant/company/branch scope.
- Hub verification passed **25 files / 111 tests** and TypeScript. Live
  PostgreSQL concurrency/recovery evidence and independent parallel-run
  approval remain external gates.

### Store Edge per-branch acceptance serialization (2026-08-07)

- Durable Store Edge acceptance now takes a PostgreSQL
  `pg_advisory_xact_lock` derived from the tenant/company/branch scope before
  reading the existing event, transaction key, or branch sequence. This keeps
  the monotonic sequence decision serialized inside the same transaction-local
  RLS boundary and prevents two concurrent writers from both accepting against
  one stale `MAX(sequence)` observation.
- The lock is transaction-scoped and is released automatically with the
  injected `withScope` transaction; no process-global lock or unbounded state is
  introduced. Hub verification remains **25 files / 111 tests** and TypeScript
  clean. Live PostgreSQL concurrency, failover, and store coordination evidence
  remain external gates.

### Store Edge HTTP-to-worker handoff (2026-08-07)

- The Node Retail Hub adapter now accepts an injected, scope-bound
  `StoreEdgeSyncWorkStore`. When configured, recorded and idempotent events are
  handed to the worker queue before the adapter returns `202`/`200`; repeated
  events reuse the existing work item instead of creating duplicates.
- The adapter remains explicit about local-only mode when no worker store is
  injected. A production deployment must provide a durable implementation and
  still run inbox plus work insertion in one PostgreSQL transaction for atomic
  outbox evidence. Hub verification passed **25 files / 112 tests** and
  TypeScript remains clean; live deployment and atomic transaction evidence are
  external gates.

### Store Edge atomic inbox/outbox coordinator (2026-08-07)

- `createPostgresStoreEdgeSyncRepository` now exposes `acceptAndEnqueue`. It
  opens one transaction-scoped RLS boundary, reuses the event and worker
  repositories against that same client, and commits the event row, receipt,
  and worker item together. If worker insertion fails or has no authoritative
  row, the transaction fails instead of returning a synthetic success.
- The Node HTTP adapter detects and prefers this atomic operation. The worker
  repository also fails closed when an insert race produces no authoritative
  row. Hub verification passed **25 files / 115 tests** and TypeScript remains
  clean; live PostgreSQL rollback/concurrency and deployed worker evidence
  remain external gates.

### Store Edge atomic deployment gate (2026-08-07)

- Added `RETAIL_HUB_STORE_EDGE_ATOMIC_INBOX_CONFIGURED` to the server-owned
  deployment configuration. Staging and production readiness now expose a
  dedicated `store-edge-atomic-inbox` check and remain on hold until the
  deployed adapter is wired to `acceptAndEnqueue`.
- The preflight report returns only the check ID/status and never configuration
  values. Missing or malformed flags remain named invalid-config blockers;
  local source code or an in-memory queue cannot satisfy the production gate.
- Hub verification remains **25 files / 117 tests**; root TypeScript and
  ESLint are clean. Live transaction rollback, PostgreSQL/Redis deployment,
  and real store recovery evidence remain external.

### Retail Hub RLS scope verification (2026-08-07)

- Hardened `createRlsScopedSqlClient`: after parameterized transaction-local
  `set_config` calls, it reads `current_setting(..., true)` for all three
  scope dimensions and refuses to invoke repository SQL if any value differs
  or is absent. Direct unscoped queries still fail closed.
- Added mismatch and rollback-propagation tests. Hub verification passed **25
  files / 117 tests**; root TypeScript and ESLint remain clean. A live pool,
  applied RLS migration, and database rollback drill are still external.

### Store Edge durable worker metrics (2026-08-07)

- Added the scope-bound `StoreEdgeSyncWorkerMetricsStore` seam. Worker runtime
  counters are now loaded and saved by tenant/company/branch, and the async
  `loadMetrics(scope)` read is available before a worker run, so a restart
  restores history and one branch cannot expose another branch's totals.
- Added the PostgreSQL projection repository and migration table
  `retail_store_edge_sync_worker_metrics`, protected by a scoped primary key,
  `FORCE ROW LEVEL SECURITY`, and the same verified transaction-local RLS
  settings used by the event/work repositories. Missing rows start at zero;
  malformed counters or unscoped clients fail closed.
- Hub verification passed **26 files / 123 tests** and TypeScript; root
  TypeScript and ESLint are clean. A live metrics exporter, applied migration,
  restart drill, and independent production observability evidence remain
  external deployment gates.

### Provider certification credential binding (2026-08-07)

- Provider certification handoffs now require a positive monotonic
  `credentialRevision`; the revision is included in the redacted package and
  the simple release form never accepts secret material.
- Independent verification can receive the current vault revision and rejects
  a package produced by an older generation, while preserving the checksum and
  evidence references for audit. Existing connector conformance/readiness
  projections continue to classify rotated evidence as stale.
- Focused provider-certification and renderer verification passed **48 tests**;
  root TypeScript remains clean. A live vault revision resolver, real provider
  credentials, and independent sandbox/production approval remain external.

### Keyring lifecycle and cross-repo verification (2026-08-07)

- The Electron main process now migrates the legacy safeStorage blob into a
  versioned `keyring.v2.json` without changing the underlying master material,
  retains the v1 rollback source, rewraps when Electron reports
  `shouldReEncrypt`, and rejects renderer access or weak Linux vault backends.
  The boundary is explicitly not native SQLCipher/page encryption or OS
  master-key retirement.
- Bakaloo backend auth now has encrypted server-side TOTP enrollment,
  one-use login challenges/recovery hashes, replay-safe time steps, and real
  browser setup/confirm/disable routes. The full backend baseline is green:
  **158 files / 1,701 tests**, with lint clean. Epic BOS TypeScript is clean;
  the focused credential/security group is **6 files / 28 tests**.
- Windows x64 Epic BOS **0.1.78** was rebuilt and its installer, package, and
  update feed pass manifest/checksum verification. macOS/Linux artifacts,
  signing/notarisation, device/provider certification, and live deployment
  evidence remain external release gates.
## Bounded Electron suite verification (2026-08-08)

The full Electron/jsdom suite was previously exceeding a single-command runner
limit without producing a useful failure boundary. The new
`scripts/run-test-batches.mjs` runner sorted and executed all 246 test files in
11 sequential, one-worker batches. Every batch passed: **1,057 tests passed,
0 failed, 0 timed out**. Batch logs and `summary.json` are generated under the
local `test-evidence/electron-full/` evidence directory (ignored from source
control by design). This closes the local Electron suite gate only; packaged
native launch, device, provider, signing, and independent UI/UAT evidence
remain separate release gates.
## Native bridge hardening and Windows 0.1.79 release (2026-08-08)

The renderer-exposed native USB/Bluetooth evidence route was removed. Generic
operator acknowledgement now fails closed for native-driver-required profiles;
only the future signed main-process bridge seam can submit bounded driver
identity and response metadata. Affected domain/UI/policy coverage passed **76
tests**. TypeScript, lint, registry, IPC alignment (537 handlers), and renderer
copy checks passed. Windows x64 build **0.1.79** was rebuilt and its installer
manifest/checksum verified. Release matrix remains held because macOS/Linux
artifacts and external provider/device/UAT evidence are still absent.
## Signed native-device attestation and Build 0.1.80 (2026-08-08)

Native USB/Bluetooth evidence now requires an Ed25519 detached signature bound
to the immutable profile/version, command checksum, response metadata, driver
identity, timestamp, and nonce. Wrong-key, stale, tampered, malformed, and
unsigned results fail closed; generic renderer/operator acknowledgement remains
blocked. Domain/profile/store regression coverage passed **46 tests**. The
Windows 0.1.80 installer, manifest, isolated packaged smoke evidence, and
three-artifact release pack verify successfully. Release is still held for
real bridge/hardware, providers, cross-platform signing, live Hub deployment,
and independent UAT.

The post-change bounded Electron run also passed **246 files / 1,057 tests** in
11 batches with no failed or timed-out batch.

Retail Hub typecheck and its local regression suite also passed **26 files /
123 tests**. This is contract evidence only; no live Hub deployment or
shadow-import credentials were used.
## Native attestation nonce replay guard and Build 0.1.81 (2026-08-08)

Native attestation nonce reuse is now rejected across completed device records,
closing the remaining signed-envelope replay path. Focused transport coverage
passed **9 tests** after the guard. Windows 0.1.81 installer, manifest,
packaged smoke evidence, and release pack verify against one build identity.
The release remains held for external bridge/hardware, provider, deployment,
cross-platform signing, and UAT evidence.
## Retail Hub fail-closed production startup boundary (2026-08-08)

Added `startRetailHubProductionServer`. It evaluates the server-owned,
value-free deployment preflight before creating a Node listener, rejects
missing/wildcard bind hosts and malformed ports, and closes a listener if
binding fails. The service, trusted scope/authorization resolver, PostgreSQL,
Redis, vault, TLS termination and Bakaloo connector are still explicit host
dependencies; this is not a live deployment claim. Hub verification is now
**27 files / 126 tests**, with typecheck clean.
## Linux cross-build artifact boundary (2026-08-08)

An explicit `EPIC_BOS_ZIP_ONLY_CROSS_BUILD=true` mode now lets a Windows host
produce the portable Linux ZIP without selecting native RPM/DEB makers. Epic
BOS 0.1.81 Linux x64 ZIP manifest/checksum verification passed. This proves
artifact integrity only; native Linux smoke/signing and macOS packaging remain
native-runner and certification gates.

The release workflow now binds Windows, Linux and macOS jobs to the same
source build revision. This matches the matrix verifier's single-release-line
contract while retaining the platform in each artifact's full provenance.
## Bakaloo migration governance boundary (2026-08-08)

The backend migration runner now plans both `.sql` and `.js` migrations by
numeric prefix plus complete filename, reports legacy duplicate prefixes,
stores SHA-256 checksums in `_migrations`, and fails closed when an applied
migration changes. Existing rows without checksums require the explicit
`ALLOW_MIGRATION_CHECKSUM_BACKFILL=true` operator flag for one controlled
backfill. `pnpm run db:plan` reports the current **100-migration** plan; focused
planner and migration-regression coverage passed **8 tests**, with targeted
ESLint clean. A live PostgreSQL dry run and restore/replay evidence remain
external.

## Packaged retailer navigation certification (2026-08-08)

The packaged Windows UI journey now creates a caller-supplied evidence
directory before writing its result, so a clean certification workspace cannot
fail after the UI assertions have passed. The exact 0.1.81 Windows executable
passed `e2e/electron/retail-navigation.e2e.ts` in **220.4 seconds**. The run
exercised all **8** primary retail workspaces, **31** visible submodules, and
**45** workspace shortcuts; renderer errors and retired demo strings were both
empty. Desktop and 700px-wide viewport checks confirmed the main scroll owner
remains usable (`overflow-y: auto`) and has no horizontal overflow. Evidence:
`test-evidence/e2e-ui-certification/retail-navigation-certification.json`.

This is automated Windows packaged evidence only. Human role-by-role UAT,
native macOS/Linux visual review, signed production artifacts, physical device
acknowledgements, provider credentials, and live Hub deployment remain open
release gates. The final rerun used the exact packaged build revision
`ci-local-e964155a642ecd6f33d4ce2b06f031cd`; bound evidence is at
`test-evidence/e2e-ui-certification-bound/retail-navigation-certification.json`.

## Packaged POS and recovery certification (2026-08-08)

Three additional journeys passed against the same build revision: the rendered
cash POS checkout survived restart, an offline sale persisted and synchronized,
and an offline conflict rejected cashier self-resolution until independent
supervisor evidence was recorded. Intelligence and maintenance route journeys
also passed. During this run the protected E2E proof scripts were corrected to
read the active `keyring.v2.json`, derive the v2 `runtime-database` artifact
key, and retain a fail-closed legacy v1 fallback. This keeps recovery proof on
the real encrypted envelope path after keyring migration. Focused result:
**3 files / 3 tests passed**; external hardware and live-provider recovery
evidence remain separate gates.

## Bakaloo admin-order scope hardening (2026-08-08)

The admin order routes now run `requireShopScope()` after authentication and
propagate the effective shop through the controller/service/repository chain.
Parameterized scope predicates cover list/count, status statistics, detail
children, notes, status transitions, delivery/rider actions, cancellation and
refund reads, exports, generated documents, and manual-order writes. HQ users
without a shop scope keep the deliberate global view. Focused repository proof
passed **3/3 tests** and the existing admin-order group passed **26/26**.
Live multi-shop PostgreSQL/Redis route evidence and adoption of the same
boundary across every remaining shop-owned module are still open.

## Bakaloo admin-customer scope hardening (2026-08-08)

The admin customer routes now run `requireShopScope()` after authentication
and carry the effective shop through list/detail/order/address/report/export
queries plus wallet, notification, and block/unblock actions. Shop-scoped
customer visibility is defined by an order relationship at that shop; HQ
users retain the intentional global view. Wallet/notification service guards
fail closed when the customer is outside the caller's shop. Focused repository
proof passed **3/3 tests**. Live multi-shop PostgreSQL/Redis evidence and
remaining-module adoption are still open.
## Bakaloo admin-rider scope hardening (2026-08-08)

Admin rider reads and writes now carry `request.shopId`. Shop staff and
delivery-assignment ownership are parameterized across fleet lists, detail,
earnings, payouts, live locations, KYC, approval, suspension, and commission.
Scoped payout creation checks association inside the transaction and writes
the selected `shop_id`; migration `095_rider_payout_shop_scope.sql` adds the
ownership column while preserving legacy HQ-wide rows for global operators.
Focused repository proof was added for scoped list/detail/earnings/payout
queries, KYC/live-location scope, cross-shop mutation denial, and the
pre-insert payout guard: **5/5
tests passed**. The backend lint gate and Node syntax checks are clean. The
unit-only shop-isolation regression set also passed **36/36 tests**; the live
cross-shop integration fixture still times out when PostgreSQL/Redis are not
available. Applying migration 095 and live multi-shop route evidence remain
open.
## Bakaloo admin-abandoned-cart scope hardening (2026-08-08)

Admin abandoned-cart routes now carry `request.shopId`. A shop-scoped query
accepts only complete single-shop snapshots: at least one item belongs to the
shop and no item belongs elsewhere or has a missing shop. The invariant is
applied to lists/counts, detail children, summary metrics, reminder records,
and coupon recovery records. Focused repository proof passed **4/4 tests**;
the combined abandoned-cart/order/customer/rider unit set passed **38/38**.
Live infrastructure, notification delivery, and provider evidence remain open.

## Allocation and shop-staff scope hardening (2026-08-08)

Allocation cross-user recompute now authorizes only the canonical
`platform_role`; a legacy/base `role: ADMIN` claim is insufficient. Shop-staff
routes run shared scope middleware on reads and writes, resolve
`request.shopId` as authoritative, and reject scoped callers whose legacy body
shop differs. Focused allocation coverage passed **66/66**, new controller
scope coverage passed **4/4**, and the HTTP/middleware regression set passed
**31/31**. Live PostgreSQL/Redis multi-shop evidence and migration application
remain open.

## Coverage-map shop truth hardening (2026-08-08)

The coverage-map active-order indicator now filters by the selected shop, so
an order at another shop cannot alter this map's operational state. Focused
repository coverage passed **1/1 test**. The endpoint remains HQ-only and
read-only; live multi-shop and location-privacy certification remain open.

## Settlement late-refund ownership hardening (2026-08-08)

Late-refund settlement now resolves the owning shop from the order whenever an
`orderId` is present and rejects mismatches before applying financial deltas.
Explicit date overrides remain supported. Focused settlement coverage passed
**3/3** and the worker regression set passed **24/24**. Live database/queue
recovery evidence remains open.

## Dashboard pending-action shop isolation (2026-08-08)

Shop-scoped pending actions now filter payouts by `shop_id` and pending rider
counts by delivery assignments belonging to that shop. Focused dashboard scope
coverage passed **8/8**; migration 095 and live multi-shop dashboard evidence
remain open.

## Delivery mutation and proof ownership hardening (2026-08-08)

Reject, cancel, pickup, and delivery mutations now require the assignment,
order, and rider identifiers to agree inside the SQL write itself. Idempotent
fallback reads and delivery OTP storage/verification use the same ownership
predicate. Proof uploads now fail closed and roll back before touching the
order when the assignment update affects no rows. Focused repository coverage
passed **4/4 tests**; live multi-rider concurrency and recovery evidence are
still required.

## Finance control-plane canonical authorization (2026-08-08)

Admin finance global-view and payout/settlement guards now use canonical
`platform_role` authority, so a legacy/base `role: ADMIN` claim cannot grant
cross-shop finance control. Route authorization coverage passed **2/2 tests**;
the existing flat-finance repository set passed **7/7**. Live deployed role
hydration and finance UAT remain open.

## Bulk-order and admin target authorization (2026-08-08)

Bulk-order transition/list/detail paths now use canonical platform-admin
authority for cross-shop access. Admin user blocking now protects every
canonical HQ role from a target record's `platform_role`, rather than relying
on the mutable base role. Bulk-order/unit/property coverage passed **103/103**
and admin target-protection coverage passed **2/2**.

## Audit-log canonical HQ scope (2026-08-08)

Audit-log scope resolution now recognizes only canonical `platform_role`
values as HQ; legacy base `role: ADMIN` and shop-staff tokens cannot be
promoted to global audit scope. Focused scope coverage passed **2/2**; route
permission and deployed UAT remain open.

## Governed delivery-service regression and compound ownership verification (2026-08-08)

Vitest now includes source-adjacent `src/**/*.{test,spec}.{js,mjs}` files in
addition to the normal `tests/` tree. Delivery service, repository ownership,
and map-boundary verification passed **3 files / 18 tests**, with ESLint clean.
The broader authorization and shop-isolation regression set passed **25 files /
272 tests**. These are local dependency-injected checks; Postgres and Redis
were not running, so live multi-shop, queue, and recovery evidence remains an
explicit release gate.

## Coupon admin shop-ownership hardening (2026-08-08)

Coupon target-user, analytics, update, and delete handlers now resolve and
authorize the coupon against the active shop before reading or mutating it.
Non-HQ category/product/delivery coupons are bound to the creating shop, while
HQ roles retain intentional global control. Coupon and canonical-auth coverage
passed **9 files / 62 tests**, with ESLint clean. Live role hydration and
database evidence remain external gates.

The reconciled authorization, delivery, allocation, coupon, worker, property,
and cross-shop integration gate passed **34 files / 334 tests**. The follow-on
team/HQ, legacy-auth, target-protection, and data-audit rerun passed **40 files
/ 351 tests**. Redis and PostgreSQL were not running, so this is local evidence
rather than a live infrastructure certification.

The Electron retail workspace was also rechecked: TypeScript `tsc --noEmit`
and cached ESLint passed. A new packaged artifact is intentionally deferred
until the live infrastructure and external certification gates are available.

The complete backend Vitest gate passed **178 files / 1,773 tests** with ESLint
clean. Connection-refused messages are expected because local PostgreSQL and
Redis are not running; they are not live deployment evidence.

## Dashboard rider scope correction (2026-08-08)

Scoped dashboard KPI, summary, and live-stat rider counts now resolve through
shop-owned delivery assignments and orders instead of exposing the shared
platform rider pool. Unscoped HQ calls retain the global view. Focused
dashboard coverage passes **2 files / 10 tests** with ESLint clean; deployed
multi-shop and role-hydration evidence remains required.

The reconciled full backend gate now passes **179 files / 1,776 tests** with
ESLint clean. Local PostgreSQL/Redis connection failures remain expected and
do not count as live infrastructure evidence.

## Team administration canonical-HQ boundary (2026-08-08)

Team role counts and member lifecycle queries now require a canonical
`platform_role` and exclude users with a non-deleted `shop_staff` assignment.
New invites persist a validated HQ platform role and default legacy clients to
least-privilege `HQ_SUPPORT`; the base `role='ADMIN'` flag is no longer used as
an HQ membership test. Combined team/auth target coverage now passes **6 files
/ 17 tests** and backend ESLint passed. Team target mutations now protect
`SUPER_ADMIN` accounts and block self-deactivation. A production data audit remains open for historical
rows affected by the old ADMIN backfill migration.

The compatibility `findAdminByEmail` and `findAdminById` helpers now use the
same canonical boundary; combined team/auth target coverage now passes **6 files
/ 17 tests**. A deployed data audit remains required before this
historical compatibility path can be certified.

Added `pnpm db:audit-platform-roles`, a count-only read-only audit that exits
with code `2` when historical or mixed-role identity conflicts exist. The
operator check passed **2/2 unit tests**; it still requires an approved live
PostgreSQL snapshot to produce certification evidence.

## Production preflight boundary (2026-08-08)

Added the read-only `pnpm ops:preflight` backend gate. It fails closed when
production mode, strict auth flags, demo-disable flags, secret/key material,
PostgreSQL/Redis reachability, provider configuration, production origins,
migration planning, or external certification evidence is missing. Its JSON is
redacted and stable for CI/release tooling, and it performs no writes. Focused
coverage passes **4/4 tests** and ESLint is clean. The local command returns
`hold` while this workspace lacks live infrastructure and real provider
credentials/evidence, which is the truthful outcome.

## Shop authority snapshot rehydration (2026-08-08)

Shop-scoped HTTP requests now use a versioned `bakaloo:staff-scope:v2` cache
snapshot containing active assignment, shop role, and permissions. Cache hits
rehydrate request authority, while misses query active `shop_staff` and `shops`
rows before caching. Staff lifecycle invalidation deletes both the legacy
boolean key and v2 snapshot. This closes the stale-JWT role/permission window;
legacy boolean values are accepted only during the bounded cache migration.
Focused scope/auth/cross-shop coverage passed **43 tests**. The full backend
gate passed **1778/1778 tests** with ESLint clean using a 30-second integration
hook budget; local Redis/PostgreSQL connection-refused diagnostics remain
environment warnings, not live deployment evidence.

## Canonical gateway refund contract (2026-08-08)

Gateway refunds now derive one full captured-payment amount. The standalone
payment endpoint no longer accepts operator-entered amounts, rejects malformed
or repeated refund state before calling Razorpay, and resolves payments
through the owning order's shop when a scope is present. Admin and shop-order
refunds pass the same captured-payment boundary. Wallet-credit refunds now
carry an order reference and `REFUND` subtype; migration 096 adds a partial
unique index and repository idempotency so retries cannot duplicate customer
credit. Refund/payment/admin-order/shop-order/wallet coverage passed **42
tests** and backend ESLint is clean. The complete backend gate passed
**1795/1795 tests** with the explicit integration hook budget. Provider
sandbox and finance reconciliation evidence remain external release gates.

## Unified channel-order identity foundation (2026-08-08)

Migration 097 adds a shop-scoped channel-order identity registry, append-only
source-event evidence, and durable conflict records. The backend contract
normalizes only INR events, derives a stable SHA-256 source digest, enforces
forward status transitions, and makes same-event retries idempotent. This is
an evidence boundary only: provider transport, local order creation, SKU
mapping, stock reservation, payment, and delivery remain separate governed
handoffs. Focused contract/service/repository coverage passed **9 tests**;
the complete backend gate passed **1804/1804 tests** and the deterministic
migration plan now contains 102 files. Live Hub transport and provider
parallel-run evidence remain external gates.

## Authenticated Retail Hub channel-order transport (2026-08-08)

The Retail Hub now has a trusted `/v1/channel-orders/events` ingress and
`/v1/channel-orders/receipts` read surface. It requires server-resolved
tenant/company/branch scope, an exact authorization-scope match, and explicit
channel-order permissions. Events are normalized to INR, bounded to provider-
neutral fields, checksum-addressed, and recorded in shadow or governed mode.
Same-event retries are idempotent; digest drift and backward lifecycle moves
are returned as conflicts. The transport is deliberately evidence-only and
returns `writeBackAllowed: false`; no provider, order, stock, payment, or
delivery mutation occurs. Focused Hub transport/HTTP coverage passed **7
tests**, and the isolated Retail Hub gate passed **28 files / 133 tests** with
typecheck clean. Production durable storage, approved SKU mapping, governed
sales-order/reservation handoff, and real provider parallel-run evidence remain
open.

## Exact channel-order SKU mapping boundary (2026-08-08)

Bakaloo migration 098 defines one shop/channel/connection/external-SKU mapping
identity with proposed/approved/rejected/revoked states, variant identity,
checksum, and maker/checker approval evidence. The contract resolves only an
exact approved mapping for the incoming channel and connection. Missing,
non-approved, cross-connection, or ambiguous mappings become explicit
`mapping-required` conflicts; no product-name, barcode, or fuzzy fallback can
reserve the wrong item. Focused contract coverage passed **4 tests**. The
scoped backend mapping list/proposal/approval routes are protected by the
dedicated channel-order permissions. The deterministic migration plan now
contains **105 files** (098 mapping, 099 handoff, 100 permission grants).
The PostgreSQL/RLS transport implementation is now present alongside the
in-memory test store; applying its schema and wiring a live transaction pool,
governed sales-order/reservation execution, and real parallel-run evidence
remain open.

## Maker-checker channel-order handoff boundary (2026-08-08)

Bakaloo migration 099 adds a source-digest- and mapping-checksum-bound local
handoff evidence record. Preparation requires a fully exact approved SKU map;
approval requires an independent checker and optimistic version; rejection is
explicit; execution requires an approved version, local order ID, and real
execution reference. The contract intentionally does not create an order,
reserve stock, capture payment, or contact a provider. Mapping and handoff
coverage passed **11 focused tests** including governance cases, the
deterministic migration plan now contains **105 files**, and targeted
ESLint/diff checks are clean. Migration 100 grants
`channel_orders.view`, `channel_orders.map`, and `channel_orders.handoff` only
to the intended roles. The scoped `/api/v1/channel-orders` routes now
expose order/evidence reads, exact mapping proposal/approval, and
prepare/read/decide/execute handoff operations. Applying the Hub schema and
wiring its live transaction pool, governed reservation execution, provider
pull/push, settlement reconciliation, and real parallel-run evidence remain
open.

## Channel-order API regression gate (2026-08-08)

The complete Bakaloo backend regression gate passed **190 test files / 1,818
tests** after the channel-order API, permission, and UUID handoff-boundary
changes. Targeted ESLint and `git diff --check` also pass. Redis connection
refused messages are expected in this local run because no Redis service is
running; live PostgreSQL/Redis deployment and migration application remain
production gates.

## Channel-order execution preflight (2026-08-08)

The new read-only `GET
/api/v1/channel-orders/handoffs/:handoffId/readiness` endpoint resolves every
approved variant mapping against the exact shop-scoped product row and checks
active listing and current stock. It fails closed on stale source evidence,
cancelled/returned/RTO orders, missing shop listings, inactive variants, and
insufficient stock. It also reports the required local customer, verified
delivery-address, and payment-reconciliation context instead of fabricating
values for the legacy `orders` constraints. It never reserves stock, creates an
order, captures payment, or writes to a provider. Focused channel-order tests
pass **27 tests** including the certified route surface. Live transaction
execution and external provider evidence remain open.

## Governed channel-order local execution (2026-08-09)

The new `POST
/api/v1/channel-orders/handoffs/:handoffId/execute-local` route creates a
shop-scoped local order only from an approved, current handoff. It requires an
active customer and an owned, non-deleted address, retains payment as
`PENDING`, and enforces a third actor after maker/checker approval. The
transaction rechecks exact variant/shop-product mapping, source line and INR
total integrity, quantity limits, and stock; creates the order and items;
records centralized `ORDER_DEDUCTION` stock movements; and updates both local
registry records atomically. Replays with the same execution reference are
idempotent; different references are conflicts. Focused channel-order coverage
now passes **34 tests**. Provider writes and real database/provider evidence
remain outside local certification.

Migration `101_channel_order_payment_evidence.sql` now adds an idempotent,
shop-scoped `payment_evidence_reference` column and reconciliation index to
`channel_order_handoffs`. Local execution writes the same reference into the
checksum-bound envelope and the queryable column; legacy handoff execution
remains backward-compatible with a nullable value. The migration is still
awaiting application and live PostgreSQL verification.

The subsequent full backend regression completed with **193 test files / 1,829
tests passing** in a single-worker run. Local runs still print expected Redis (and provider-service)
connection warnings because those services are not running in this workspace;
that is not production deployment evidence.

## Governed channel-order settlement workpaper (2026-08-09)

Migration `103_channel_order_settlement_workpapers.sql` adds a shop-scoped
provider-event identity for settlement evidence. The new
`/api/v1/channel-orders/settlements` surface can prepare, list, inspect, and
independently approve/reject a workpaper only after the channel order has
crossed the local execution boundary. Preparation locks the source order,
binds its latest source digest and local-order ID, checks captured/refunded
amount rules, and is idempotent for the same provider event and payload
checksum. Approval rechecks the source digest and local-order identity and
requires a different checker from the maker.

The workpaper is evidence-only: it does not mark a payment paid, issue a
refund, post a finance journal, or call a provider. Provider signature
verification, authenticated settlement pulls, bank matching, and accounting
posting remain separate production certification gates. Focused settlement
coverage passes **62 tests** including contract, repository, service, route,
and canonical-permission checks.

## Authoritative channel-order payment evidence transport (2026-08-09)

The provider-neutral channel-order contract now accepts optional, strictly
validated `paymentEvidence`: payment status (`pending`, `authorized`,
`captured`, `failed`, or `refunded`), provider/event/reference identifiers,
INR amount, and a SHA-256 checksum of the exact provider payload. The same
normalized evidence is carried through the Retail Hub in-memory and
PostgreSQL/RLS transports and is included in the source digest, so a payment
reference or amount cannot change without producing source drift.

`execute-local` now re-normalizes the stored source event before creating a
local order. When authoritative evidence exists, its payment reference and
amount must match the execution request and channel total; failed or refunded
evidence is blocked. The local order remains `PENDING` until the certified
provider settlement workflow reconciles it—this boundary never invents a
capture, bank match, refund, or provider response. Focused backend channel-order
coverage now passes **38 tests**; Retail Hub transport coverage passes **12
tests** and its typecheck is clean. Real provider signatures, settlement pulls,
finance posting, and parallel-run evidence remain production gates.

## Credential-revision-bound provider certification (2026-08-09)

Migrations `104_channel_order_provider_certifications.sql` and
`105_channel_order_certification_permissions.sql` add a shop-scoped registry
for redacted provider certification evidence. A record is bound to the exact
positive credential revision, environment, evidence checksum, expiry, and
production approval reference. Preparation is idempotent and approval is
maker-checker plus optimistic-version protected; rotating a credential cannot
silently reuse an older certification record.

`/api/v1/channel-orders/certifications` provides the scoped prepare/list/read/
decide surface. Settlement workpapers now expose a read-only
`posting-readiness` projection that checks approved workpaper state, provider
and credential-revision match, production certification status/expiry, the
shop-scoped local order, canonical payment row, settled status, amount, and
currency. It returns `writeBackAllowed: false`; it does not mark payments,
post journals, call providers, or claim external certification. Focused
channel-order coverage passes **54 tests** after this wave.

## Governed channel-order settlement posting (2026-08-09)

Migrations `106_channel_order_settlement_postings.sql` and
`107_channel_order_settlement_posting_permission.sql` add an immutable,
shop-scoped posting receipt and a dedicated HQ finance posting permission.
The new `POST /api/v1/channel-orders/settlements/:workpaperId/post` operation
requires an approved captured workpaper, an approved unexpired production
certification, and the exact credential revision. It locks the workpaper,
certification, local order, and latest payment row in one transaction; it
creates or finalizes the canonical `payments` row, marks the order payment
state `PAID` (promoting a pending order to `CONFIRMED`), writes status history,
the posting receipt, and a transactional audit event together.

The operation is idempotent by workpaper/provider event, rejects mismatched
amounts, currencies, providers, revisions, already-settled foreign events,
cancelled/refunded orders, and expired certification. It does not call a
provider or recognize revenue in the shop transaction ledger; revenue remains
the delivery settlement boundary. Full backend verification passes **198 test
files / 1,853 tests**; real provider credentials and signed external evidence
remain required before production use.

## Governed channel-order refund reconciliation (2026-08-09)

Migrations `108_channel_order_settlement_refunds.sql` and
`109_channel_order_settlement_refund_permission.sql` add an immutable refund
receipt and dedicated HQ finance refund permission. The new
`POST /api/v1/channel-orders/settlements/:workpaperId/refund` operation accepts
only an approved `refunded` provider workpaper, an approved unexpired
production certification at the exact credential revision, and a matching
prior captured posting. It is deliberately full-refund-only; partial refunds
remain in the line-level return/credit-note workflow.

The transaction locks evidence, certification, capture receipt, order, and
payment; marks the canonical payment/order `REFUNDED`, appends a new immutable
`REFUND` shop ledger entry, writes status history, persists the refund receipt,
and emits an audit event atomically. Duplicate workpapers/provider events and
amount/provider/revision mismatches fail closed. Backend verification now
passes **199 test files / 1,857 tests**.

## Channel-order finance roll-forward reconciliation (2026-08-09)

Migrations `110_channel_order_finance_reconciliations.sql` and
`111_channel_order_finance_reconciliation_permission.sql` add an immutable,
shop-scoped receipt for applying settlement evidence to the financial period.
Captured workpapers are acknowledged as deferred because delivery settlement
remains the sole revenue-recognition boundary. Approved full refunds apply
exactly once to the original delivery day's `shop_financials` row while its
payout is mutable; missing periods are deferred and PROCESSING/PAID periods
are blocked rather than amended. The scoped GET/POST finance-reconciliation
surface is idempotent by source receipt and commits financial deltas, receipt,
and audit event atomically. Live provider pulls, bank matching, GST filing,
and external certification remain production gates.

## Provider settlement pull evidence boundary (2026-08-09)

Migrations `112_channel_order_settlement_pulls.sql` and
`113_channel_order_settlement_pull_permission.sql` add durable, credential-
revision-bound pull receipts and per-item match results. The scoped
`GET/POST /api/v1/channel-orders/settlement-pulls` surface verifies an approved
unexpired production certification, stores only checksum-bound redacted
evidence, and matches each provider event against authoritative channel-order
payment evidence. Exact matches are marked `READY_FOR_WORKPAPER`; missing
orders/evidence and payload drift are explicit unmatched/conflict outcomes.
The pull never creates a workpaper, posts a payment, issues a refund, or calls
a provider; promotion still uses the existing maker/checker settlement flow.

## Settlement pull promotion to workpapers (2026-08-09)

Migration `114_channel_order_settlement_pull_promotion.sql` links pull items
to prepared settlement workpapers with explicit promotion status. The
scoped `POST /api/v1/channel-orders/settlement-pulls/:pullId/promote` route
promotes only exact matches, carries the original provider checksum and INR
evidence into the existing workpaper contract, and remains idempotent when a
workpaper was prepared by a concurrent operator. Non-matches are never
promoted; payment posting, refund handling, and finance roll-forward remain
separate approval gates.

## Partial refund credit-note reconciliation (2026-08-09)

Migrations `115_channel_order_credit_notes.sql`,
`116_channel_order_credit_note_permission.sql`, and
`117_channel_order_credit_note_credential_revision.sql` add a shop-scoped, checksum-
bound Indian GST credit-note evidence record. The routes accept only INR
evidence whose taxable value plus CGST/SGST/IGST/Cess exactly equals the
provider refund amount. Preparation is bound to an approved, credential-
revision-matched production certification and an approved refunded settlement
workpaper; full refunds remain on the existing full-refund endpoint.

Credit notes use maker/checker separation and optimistic versions. Applying an
approved note locks the canonical payment, order, and mutable delivery-day
financial period, increments the payment's partial refund amount, appends an
immutable `REFUND` ledger entry, adjusts refund/net/payout totals, and writes
the receipt and audit event in one transaction. Missing or frozen financial
periods fail closed and no provider call is implied. Focused channel-order
coverage now passes **76 tests across 22 files**; the full backend suite passes
**205 files / 1,871 tests**. External GST filing, provider
credentials, and independent production evidence remain required.

## Certified bank/UPI/card statement matching (2026-08-09)

Migrations `118_bank_statement_reconciliation.sql` and
`119_bank_statement_reconciliation_permission.sql` add a shop-scoped bank
statement evidence boundary. The scoped import requires an approved,
unexpired production certification at the exact credential revision, validates
INR lines, preserves checksums, and matches credit lines against canonical
shop payments by provider reference and exact paise amount. Debit lines,
missing references, amount mismatches, and multiple matches remain explicit
review outcomes.

The import is idempotent by provider statement reference/checksum and writes
statement lines, match outcomes, and audit evidence atomically. It never marks
a payment paid, issues a refund, or posts a ledger entry. The backend suite now
passes **209 files / 1,877 tests** with ESLint clean; bank-provider credentials,
live statement feeds, and finance-owner approval remain production gates.

## Governed bank reconciliation application (2026-08-09)

Migrations `120_bank_reconciliation_approval.sql`,
`121_bank_reconciliation_approval_permission.sql`, and
`122_bank_reconciliation_line_integrity.sql` add the next control boundary.
Only a statement whose credit lines all have exact payment matches can be
approved by an independent checker. Approval is optimistic-versioned and
revalidates the statement's provider certification at application time.

Applying selected matched lines creates immutable, idempotent reconciliation
receipts and marks those lines reconciled. Database constraints require every
reconciled line to retain a payment/order identity. Payments, refunds, and
shop transactions remain untouched. Full verification passes **211 files /
1,882 tests** with ESLint clean.

## Settlement close-readiness projection (2026-08-09)

The bank-reconciliation surface now exposes `GET /api/v1/bank-reconciliation/close-readiness`.
It is a read-only, shop-scoped projection for an explicit date range (and
optional provider/account) covering financial periods, bank statement approval,
credit-line matching and receipts, provider workpapers, and pull conflicts.
It returns `ready`, `review`, or `blocked` with machine-readable blockers for
missing or incomplete evidence, frozen payout periods, and unresolved provider
items. It never posts a journal, marks a payment settled, or closes a period.

## Settlement close attestation evidence (2026-08-09)

Migrations `123_bank_close_attestations.sql` and
`124_bank_close_attestation_permission.sql` add a durable maker/checker
attestation for a `ready` close-readiness snapshot. The scoped
`GET/POST /api/v1/bank-reconciliation/close-attestations` surface stores the
period/provider scope, evidence snapshot, checksum, version, and audit event;
the decision endpoint requires an independent checker and re-runs readiness
before approval so changed or newly blocked evidence cannot be approved. This
is evidence only: it does not close a period, post a journal, mark a payment
settled, or imply live provider certification.

## GST outward-supply workpaper readiness (2026-08-09)

The scoped `GET /api/v1/gst-workpaper` endpoint now projects Indian GST
evidence from the shop registration, fee tax configuration, delivered/refunded
orders, delivery-state classification, and GST credit-note records. It reports
`ready`, `review`, or `blocked` with explicit blockers for missing GSTIN,
disabled/invalid tax configuration, missing tax or invoice evidence, missing
supply state, and open credit-note evidence. It always returns `canFile: false`
and explicitly records that HSN evidence, GSTR-1 payload generation, and live
GSP/IRP submission remain separate production gates.

## GST invoice evidence staging and coverage (2026-08-09)

Migrations `125_gst_invoice_evidence.sql` and
`126_gst_workpaper_permissions.sql` add a strict, shop-scoped GST invoice
evidence staging boundary. Evidence captures invoice/order identity, B2B/B2C
supply type, HSN, place of supply, quantity, rate, and paise-level CGST/SGST/
IGST/cess totals. Database and contract checks reject invalid GSTIN/HSN shapes,
mixed IGST and CGST/SGST, and tax-total mismatches. Preparation is idempotent;
approval is maker/checker and optimistic-versioned with immutable checksums and
audit events. The workpaper now reports approved evidence coverage and blocks
when scoped delivered/refunded orders lack approved evidence. This remains
staging only: no GSTR-1 payload, GSP/IRP call, accounting post, or filing claim.
The contract and database also require the stated GST rate to reconcile to the
CGST/SGST/IGST components (rounded to paise); cess remains separately evidenced.

## Shop-scope route coverage guard (2026-08-09)

The backend permission audit now checks more than a Permission_String: every
shop-owned route under the scoped shop prefixes must carry either
`requireShopScope({ requireShop: true })` or a resource-level
`requireShopMatch` proof. The middleware exposes non-request metadata for this
boot-time check. Shop-staff routes now require an active outlet scope rather
than relying on a legacy body target; HQ payout hold/release routes perform a
parameterized shop-financial lookup before the HQ mutation. Focused scope and
boot-audit coverage passes **47 tests** with ESLint clean. This is still a local
route-table control; live multi-shop PostgreSQL/Redis evidence and independent
security review remain required.

## Shop-scope route regression verification (2026-08-09)

The post-change backend regression passes **221 test files / 1,907 tests** with
ESLint clean. The focused scope, finance, payout, staff, and boot-audit set
passes **151 tests**. Redis connection-refused logs are expected when the local
Redis service is stopped; they do not change the green test exit code. This
verifies code-level route coverage only; live multi-shop PostgreSQL/Redis
evidence and independent review remain production gates.

## Provider credential vault boundary (2026-08-09)

Provider credentials now have a fail-closed AES-256-GCM vault helper with
shop/provider/environment/revision-bound authenticated data, stable checksums,
and redacted metadata. Migration `127_provider_credentials.sql` adds encrypted
revision storage, one-active-revision enforcement, and automatic revocation of
approved certification evidence when a newer revision is inserted. This is the
storage/control boundary only; provider CRUD wiring, real credentials, and
external certification remain intentionally open.
Repository-wide verification after this boundary passes **223 test files /
1,911 tests** with ESLint clean.

The boundary is now exposed through shop-scoped `GET /api/v1/provider-credentials`
and `POST /api/v1/provider-credentials/rotate` routes. Only SUPER_ADMIN and
ADMIN receive the new permissions; responses contain revision/checksum/status
metadata only and never decrypted values. The rotation path is transactional
and audited. Live key custody, deployment secret management, and external
provider certification remain open.
Final post-wiring verification passes **225 test files / 1,914 tests** with
ESLint clean. Redis connection-refused logs are local-environment warnings
when the Redis service is stopped.

## Credential-revision certification binding (2026-08-09)

Provider-certification preparation and approval now require an active matching
vault revision for the same shop, provider, and environment. A retired or
missing revision fails closed with a conflict; a prepared certification cannot
be approved after rotation. This closes the metadata-only revision gap while
leaving real provider credentials and external certification evidence open.
Final verification after certification binding passes **225 test files / 1,915
tests** with ESLint clean; Redis connection-refused logs are local-only.

## Store Edge batch Hub replay (2026-08-09)

Electron now exposes a bounded `syncRetailHubStoreEdgeQueue` operation. The
main process derives completed-sale events from the local immutable ledger,
reuses event identity on retry, consumes branch sequences monotonically, and
records failed/sent/idempotent evidence per sale without allowing one failed
transport to block the rest of the batch. The operation is wired through IPC,
preload, authorization policy, and the POS workbench's `Sync pending sales`
action. It remains credential-free; live Hub deployment and reconciliation are
still external production gates.

Electron verification: typecheck clean, lint clean, IPC handler/policy
alignment clean (537 permissioned handlers), and focused Store Edge/provider
tests pass **26 tests**. The full Electron regression suite also passes **246
test files / 1,058 tests**.

## Store Edge batch run summaries (2026-08-09)

Each bounded Store Edge replay now appends a local run summary with start/end
timestamps, actor, HTTPS origin (without credentials or query material),
attempted count, sent/idempotent/conflicted/failed counts, and a no-work or
completed-with-errors status. The POS displays the latest summary as explicit
operator evidence. URL validation fails closed before any network call.
Typecheck, lint, focused tests, and the full **246-file / 1,058-test** Electron
suite remain green.

## Governed Store Edge retry policy (2026-08-10)

The POS now supports an explicit, operator-controlled retry policy for Store
Edge → Retail Hub synchronization. The policy persists only a normalized HTTPS
origin, interval (5/15/30/60 minutes), batch limit, actor, and scope; it never
stores credentials or query material. When enabled, the authenticated POS
workspace resumes bounded replay after restart and prevents overlapping ticks
or ticks while another POS mutation is busy. Disabling the policy stops future
automatic network attempts; the Hub remains authoritative and each attempt is
still recorded locally.

Verification: full Electron suite **246 test files / 1,060 tests**, typecheck,
lint, and IPC handler/policy alignment all pass.

## Fenced Store Edge worker lease renewal (2026-08-10)

The Retail Hub Store Edge worker now renews each active lease with the current
fencing token while a long-running processor is executing. Lease renewal is
scope-bound and preserves ownership/attempt counts in both the in-memory and
PostgreSQL repositories. The runtime records a failed heartbeat as a failed
processing attempt instead of acknowledging work it no longer owns.

Verification: Retail Hub typecheck passes; worker lease, PostgreSQL repository,
and runtime heartbeat coverage passes **21/21 tests**. No provider response or
live deployment is fabricated.

## Governed Store Edge dead-letter recovery (2026-08-10)

The Retail Hub now exposes scope-bound dead-letter evidence and a recovery-only
requeue action. The action requires `store-edge:recover`, a reason, and an
operator reference; it resets the retry budget while retaining recovery
metadata. PostgreSQL requeue is row-locked and fails closed unless the item is
currently dead-lettered. Verification: the Hub suite passes **29 test files /
144 tests**, with root TypeScript and ESLint clean.

## Provider webhook evidence-drift guard (2026-08-10)

The Bakaloo backend payment receipt ledger now binds a Razorpay event ID to its
event type and exact signed-body checksum. A reused ID with different evidence
returns `WEBHOOK_EVENT_CONFLICT` before any payment or wallet finalization;
matching failed/stale claims still recover and processed retries remain
idempotent.

Verification: focused webhook/repository coverage passes **9/9 tests**; the
complete backend Vitest suite and ESLint pass. Redis connection-refused output
is limited to the existing local test environment warning.

## Capability-gated realtime shop rooms (2026-08-10)

Socket.IO now derives shop-room access from the canonical database-backed
principal and an explicit operational read permission. Active assignment rows
without a realtime read capability cannot receive shop-scoped live events;
shop order tracking additionally requires `shop_orders.view`. No client-supplied
shop identifier is used to widen scope. Customer ownership, active rider
assignment, and canonical HQ access remain supported.

Verification: focused socket authorization coverage **11/11 tests**; complete
Bakaloo backend suite **226 test files / 1,921 tests**; ESLint clean. Redis
connection-refused messages are the existing local test-environment warning.
Live deployment, real multi-shop traffic, and independent security review are
still required before production certification.

## Guarded provider credential runtime boundary (2026-08-10)

Provider adapters now have an internal-only `loadActiveForRuntime` path. It
requires a shop scope and a normalized sandbox/production context, selects
only the active revision, decrypts it with revision-bound AES-GCM AAD, and
compares the decrypted credential checksum with the stored checksum before
returning plaintext in-process. Missing, retired, tampered, or checksum-drifted
records fail closed. HTTP routes continue to return redacted metadata only.

Verification: focused credential coverage **10/10 tests**; complete backend
suite **227 test files / 1,926 tests**; ESLint clean. Provider key custody,
deployment, and real external certification remain open.

## Scoped dynamic attachment IPC (2026-08-10)

The three dynamic attachment channels now require an active company and branch
scope. Their client-selected resource is authorized through the scoped kernel
decision before list/add/export reaches the encrypted vault. Merchandising image
descriptor lookup now uses the same scope, preventing an attachment from
another branch or company from being used as a product image.

Verification: focused Electron coverage **29 tests**; `pnpm typecheck` and
`pnpm lint` pass. Independent role/UAT evidence and packaged cross-platform
certification remain open. The full Electron suite passes **246 files / 1,060
tests**, and `pnpm build` produces the Windows x64 package.

## Production native-runtime encryption gate (P0-16, 2026-08-10)

Electron now evaluates the runtime database encryption contract before opening
the protected SQLite runtime. When `EPIC_BOS_REQUIRE_NATIVE_SQLITE=1` (or
`true`/`yes`) is enabled for a production launch, startup fails closed unless
the configured driver produces certified `native-encrypted` evidence. Local
development continues to expose the truthful persisted AES-GCM envelope
boundary, and the same evidence is supplied to IPC operational health. This
does not pretend that SQLCipher/equivalent is already packaged. Focused
security/driver/protected-database coverage passes **15/15**; full Electron
coverage passes **246 files / 1,064 tests**; typecheck, ESLint, and Windows
packaging pass. The native driver, macOS/Linux signing, and independent
production certification remain external gates.

### P0-17 — Governed Bakaloo delivery-map evidence surface (2026-08-10)

Implemented the delivery-map seam as an evidence-only renderer surface. Added
`RetailDeliveryMapSignal` state compatibility, `buildRetailDeliveryMapSurface`
classification, and a premium blue/white map evidence panel. Only verified
coordinates are rendered; stale signals are amber, blocked signals stay in the
blocker register, and empty state explicitly requests a signed rider/device
or provider-webhook observation. No Google Maps key, network tile, route, or
ETA is introduced.

Verification: focused domain/renderer coverage **6/6 tests**; full Electron
coverage **248 files / 1,069 tests**; typecheck and ESLint pass. Live map
import and external reconciliation remain provider/Retail Hub gates.

### P0-18 — Scope-bound delivery-map signal ingestion (2026-08-10)

Added `normalizeRetailDeliveryMapSignal` and
`ingestRetailDeliveryMapSignal`. The boundary accepts only the renderer-safe
map projection, validates status, ISO timestamps, coordinate ranges, evidence
references, and optional scope, then persists the active company/branch copy
through `RevenueOpsStore`'s serialized mutation queue. Unknown provider fields
are dropped, foreign scopes fail closed, and replaying an unchanged signal is
idempotent. No raw credential/provider payload or write-back permission is
exposed to the renderer.

Verification: focused map/ingestion coverage **9/9**; full Electron coverage
**249 files / 1,072 tests**; TypeScript and ESLint clean; Windows x64 package
builds. Live Hub transport and real evidence certification remain external.

### P0-19 — Read-only Bakaloo coverage-map transport (2026-08-10)

Added `RetailHubCoverageMap` contracts and the main-process
`fetchRetailHubCoverageMap` client for Bakaloo's existing
`/v1/admin/coverage-map/:shopId` route. The client validates the success
envelope, size/content type, shop and customer coordinates, pincode boundaries,
active-scope binding, and read-only source markers. It rejects `0,0` defaults,
arbitrary credentials/headers, and any non-HTTPS base URL. A new IPC channel is
permission-gated to `release.control/read`; the renderer receives only the
validated projection.

Verification: focused transport, IPC, and renderer coverage **23/23**; the
full Electron suite passes **251 files / 1,077 tests**; TypeScript, ESLint,
capability-registry, IPC-policy alignment, and Windows packaging pass. The
validated projection is rendered in the delivery workspace with no write-back
controls. Live Hub authentication and production reconciliation remain
external gates.
### P0-20 - Cross-platform artifact inspection pass (2026-08-10)

Generated the unsigned Linux x64 ZIP inspection artifact and its release
manifest from the verified source revision. Windows packaging remains green.
The Windows host did not emit a macOS artifact; native macOS CI is still the
required path for a truthful macOS build, signing, notarisation, updates,
and hardware certification.
### P0-21 - Vault-backed Bakaloo coverage-map Hub route (2026-08-10)

Added a server-only credential-vault adapter for Bakaloo's existing coverage
map. Every GET is bound to one credential revision, validates the complete
read-only projection and coordinates, and fails closed on rotation or unsafe
responses. Added the scoped `coverage-map:read` Hub route; it derives scope
from trusted authorization and bypasses unrelated shadow-import reads.

Verification: focused adapter/route coverage **18/18**; full Retail Hub
coverage **30 files / 149 tests**; Hub and Electron typecheck, ESLint, and
Windows packaging pass. Real vault configuration, deployment, and production
reconciliation remain external.
### P0-22 - Checksum-bound Bakaloo coverage projection (2026-08-10)

Added a shared canonical serializer and SHA-256 projection checksum for the
read-only Bakaloo coverage payload. Retail Hub computes the checksum after
validating its server-owned response; Electron recomputes it after local
validation and fails closed on missing, malformed, or changed evidence.

Verification: focused checksum coverage **23 assertions**; full Retail Hub
coverage **30 files / 149 tests**; full Electron coverage **251 files /
1,077 tests**; Electron typecheck, ESLint, and Windows packaging pass. Native
release builds, live vault deployment, and production reconciliation remain
external gates.
### P0-23 - Freshness-bound Bakaloo coverage evidence (2026-08-11)

Added a bounded receiver freshness policy to the read-only coverage-map
transport. The client requires the Hub observation timestamp, preserves it in
the evidence surface, rejects snapshots older than 30 minutes by default, and
rejects observations beyond the allowed future clock-skew window. The policy
is configurable only within safe bounds; it does not create provider data or
write back to Bakaloo.

Verification: focused freshness/checksum coverage **3/3** and Electron
typecheck pass. Deployment, live source freshness, and production
reconciliation remain external gates.
### P0-24 - Native release provenance and truthful matrix gates (2026-08-11)

Upgraded release manifests to schema 2 with explicit native/cross/unknown
build provenance. CI marks its platform runners as native; cross-platform
inspection builds cannot satisfy the release matrix. The verifier and release
certification pack now surface the provenance and retain a hold for missing
native evidence.

Verification: Windows Squirrel manifests regenerated and checksum-verified as
native. The local matrix remains on hold until native Linux and macOS jobs
produce their artifacts.
