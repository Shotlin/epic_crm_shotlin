# Bakaloo Retail Business OS — Gap Register

**Status legend:** READY, PARTIAL, LOCAL_ONLY, CERTIFICATION_REQUIRED, PLANNED, BLOCKED and DEPRECATED are evidence states, not marketing labels.

| ID | Priority | Capability / control | Current status | Evidence-based gap | Owner | Exit evidence |
| --- | --- | --- | --- | --- | --- | --- |
| P0-01 | P0 | IPC authorization | PARTIAL | All business channels have explicit policy coverage; only the three attachment channels remain intentionally delegated because their resource is selected from validated encrypted metadata and active scope. | Security architecture | Dynamic attachment channels retain negative role, company/branch scope, projection, and regression evidence; no generic session fallback. |
| P0-02 | P0 | Local data encryption | PARTIAL | Persisted state is sealed with an OS-protected envelope; v2 OS-keyring migration now fails closed for weak Linux vaults and safely rewraps when Electron requests it. Legacy plaintext SQLite is removed immediately after the copied runtime passes integrity verification. Provider, statutory-adapter, MFA, and attachment records now dual-read v1/v2 envelope keys, write v2, and expose a guarded rewrap-and-verify migration. Runtime database and backup envelopes now write namespace-separated v2 keys while dual-reading legacy v1 files. Backup administrators can inventory and atomically rewrap plaintext/v1 files in the app-managed backup directory. The `node:sqlite` runtime still has an interim plaintext window, backups saved outside that directory need explicit handling, and no end-to-end OS master-key rotation exists until a certified native encrypted driver/key resolver is registered. | Store Edge architecture | Native encrypted runtime evidence, clean-install/migration/rotation/crash tests, external-backup inventory, OS master-key retirement, and cross-platform release proof. |
| P0-03 | P0 | Credential incident response | BLOCKED | Current historic secret exposure/rotation status is unknown. | Business security owner | History-aware scan, rotation inventory and signed owner review. |
| P0-04 | P0 | Bakaloo socket scope | PARTIAL | Socket handshake re-reads account/session/outlet assignment; only canonical platform roles enter HQ. Rider telemetry now requires a valid active-order assignment before it is retained or emitted, and rejects 0/0 coordinates. Delivery state mutations, OTPs, and proof writes now require compound assignment/order/rider ownership at the repository boundary. Real Socket.IO + PostgreSQL + Redis multi-shop evidence remains open. | Bakaloo backend owner | Multi-shop Socket.IO security tests, Redis adapter evidence, delivery tracking privacy review and production deployment proof. |
| P0-05 | P0 | Backend shop isolation | PARTIAL | HTTP canonicalises authority from the current user row, and shop-scoped middleware now rehydrates active assignment, shop role, and permissions from a versioned `bakaloo:staff-scope:v2` snapshot instead of trusting stale JWT claims. Canonical platform-admin checks now protect shared auth, product, staff, financial, transaction, bulk-order, audit-log, coupon, team, and target-protection paths; a legacy base `ADMIN` value alone cannot bypass them. Team counts and member lifecycle writes require `platform_role IS NOT NULL` and exclude active `shop_staff` assignments; new invites persist a validated HQ platform role. Admin finance global-view and payout/settlement route guards now also require canonical `platform_role`. The admin order surface now derives `request.shopId` and parameterises scope across list/stats/detail/child reads, notes, status, delivery, rider, cancellation/refund, export, invoice, and manual-order paths. Admin customer list/detail/order/address/report/export routes and wallet/notification/block actions now use the same scope, with focused repository proof of 3 order tests and 3 customer tests plus 26 existing order regressions. Admin rider fleet, earnings, payouts, live-location, approval, suspension, commission, and KYC routes now scope through shop staff/delivery ownership; migration 095 adds shop ownership to new payouts and focused rider scope tests cover the negative paths. Scoped dashboard KPI, summary, and live-stat rider counts now resolve through `delivery_assignments -> orders.shop_id`, while unscoped HQ retains the platform view. Admin abandoned-cart list/detail/summary and recovery writes now fail closed for mixed-shop snapshots, with 4 focused tests. Allocation cross-user recompute now trusts only canonical `platform_role`; shop-staff routes run shared scope middleware, reject scoped body mismatches, and fail closed for unscoped shop roles, with 66 allocation, 4 controller-scope, and 31 HTTP/middleware tests. Coverage-map active-order state and dashboard pending actions now filter by the selected shop, with focused regressions. Delivery mutations, OTPs, and proof uploads now require compound assignment/order/rider ownership, and source-adjacent delivery tests are included in Vitest. Route-by-route resource-scope adoption is still incomplete, migration 095 must be applied, historical ADMIN backfill rows need data audit, and live PostgreSQL/Redis multi-shop evidence is unavailable. | Bakaloo backend owner | Canonical platform/outlet role decision, applied payout-scope migration, reviewed historical role audit, route-coverage gate and negative cross-shop integration tests across every shop-owned endpoint. |
| P0-06 | P0 | Payment webhook signature | PARTIAL | The canonical Razorpay endpoint now captures exact bytes, uses constant-time HMAC verification, requires provider event IDs, records a durable replay ledger and blocks out-of-order failure downgrades. Client payment callbacks and wallet top-ups now use the same shape-validated constant-time comparison helper. The migration, Razorpay sandbox replay and settlement/reconciliation evidence are still required before production use. | Payments owner | Applied migration, verified signature/replay tests, sandbox evidence and finance reconciliation approval. |
| P0-07 | P0 | Financial immutability | PARTIAL | Application paths are append-only and a new idempotent PostgreSQL trigger migration rejects `UPDATE` and `DELETE` of `shop_transactions`; late-refund settlement now validates order ownership before changing a daily shop_financials row. The governed migration runner, restrictive DB grants, reversal approval model and reconciliation evidence are still open. | Finance architecture | Applied append-only trigger/grants, reversal model, migration and reconciliation proof. |
| P0-08 | P0 | Dashboard MFA/map truth | PARTIAL | Epic BOS Electron has server-enforced encrypted TOTP MFA. The Bakaloo browser dashboard now has the corresponding backend migration, encrypted-secret enrollment/confirm/disable routes, one-use login challenges, replay protection, and a real challenge UI; deployment, live database migration, browser UAT, and recovery-code evidence are still open. The map no longer fabricates Kolkata or live status and now requires connected, fresh, valid rider coordinates; provider consent/provenance and real GPS deployment evidence remain blocked. | Dashboard + identity owner | Apply migration 094 in the deployed backend, run browser role/UAT and recovery drills, then certify provider-neutral map/GPS consent, provenance, and freshness evidence. |
| P0-09 | P0 | Refund contract | PARTIAL | Gateway and shop-order refund paths now share a full captured-payment contract: arbitrary caller amounts are rejected, repeated/in-progress refunds fail closed, and payment/order lookups resolve through the owning shop scope. A gateway call is also rejected when the owning order is already in the authoritative `REFUNDED` state. Order refunds that become wallet credit are now bound to the order reference and `REFUND` subtype with a partial unique index, so retries return the existing ledger result instead of issuing duplicate credit. Provider settlement/reconciliation evidence is still required. | Finance and order owners | Apply migration 096, reconcile historical duplicate refund credits, provide provider sandbox evidence, and approve the return/credit-note workflow. |
| P0-10 | P0 | Secret scanning CI | PARTIAL | Repository/history scanning is now present in dedicated and release workflows for both Epic BOS and the Bakaloo backend, but provider rotation, GitHub push-protection confirmation, and an owner-signed incident inventory remain external actions. | Release engineering | Redacted scan in CI plus a reviewed credential rotation register and owner sign-off. |
| P0-11 | P0 | Production preflight | PARTIAL | A read-only `pnpm ops:preflight` command now fails closed on unsafe runtime flags, missing secrets/MFA key, unreachable PostgreSQL/Redis, missing provider configuration, local origins, or absent independent certification evidence. Certification is now a structured, redacted record set: every declared provider needs a positive credential revision, status, assessor, timestamp, and evidence reference; a bare `allRequiredCertified` boolean no longer passes. It emits stable redacted JSON and never mutates state. Backend CI now enforces the full Vitest/ESLint and preflight-contract gates, but a live production run with approved secrets, infrastructure, and provider evidence is still required. | Release engineering | CI/release preflight passes against the approved environment, migration plan, live infrastructure, provider evidence, and independent go/no-go approval. |
| P1-01 | P1 | Retail Core UAT | CERTIFICATION_REQUIRED | Seven packaged Electron journeys now cover owner restart, POS checkout/restart, offline recovery/conflict recovery, intelligence, maintenance, and the eight-workspace retail rail (31 submodules / 45 shortcuts). Critical cashier/manager journeys still lack independent current-build evidence. | Retail operations | Signed cashier + store-manager evidence for the certification pack. |
| P1-02 | P1 | Store Edge to Hub offline sync | PARTIAL | Store Edge emits checksum-bound completed-sale events through a main-process HTTPS seam, persists append-only local receipts and a branch sequence cursor, and exposes governed POS controls. The PostgreSQL inbox now exposes an atomic `acceptAndEnqueue` operation that commits the event, receipt, and worker item through one transaction-scoped client; the HTTP adapter prefers that operation and keeps the separate queue handoff only for explicit local/test wiring. Durable Hub inbox/worker repositories require transaction-scoped RLS clients, serialize acceptance per tenant/company/branch with a transaction-scoped PostgreSQL advisory lock, reclaim expired leases, return authoritative rows after enqueue races, fence stale acknowledgements with a per-lease token even when a worker ID is reused, and fail closed when an insert has no authoritative row. Worker counters now have a scope-bound durable PostgreSQL projection that survives process restart and rejects malformed/unscoped rows. No authenticated production deployment or real store coordination has been certified. | Hub architecture | Authenticated Hub deployment, live PostgreSQL/Redis worker and metrics evidence, real Store Edge/Hub parallel run, and independent recovery certification. |
| P1-03 | P1 | Retail Hub runtime | PARTIAL | Durable shadow-import service has a dependency-free, fail-closed Node HTTP adapter and value-free deployment readiness gate. The RLS transaction adapter now parameterizes and verifies active `current_setting` tenant/company/branch values before repository SQL runs. Scoped pulls require atomic plan-plus-receipt registration, preventing half-registered evidence; there is still no authenticated Fastify/PostgreSQL/Redis deployment. | Platform engineering | Authenticated deployment, applied migration, queue, backup, observability and API contract evidence. |
| P1-04 | P1 | Shadow import | PARTIAL | Contract/test boundary exists, but no real credential vault/source export/reconciliation run. | Migration owner | Read-only import of a real non-production or approved snapshot with checksum/variance evidence. |
| P1-05 | P1 | Unified order truth | PARTIAL | Migration 097 and the backend channel-order registry now persist one shop-scoped identity per channel/connection/external order, append source events, reject checksum drift, and preserve invalid-status conflicts without touching local orders, stock, payments, or delivery. The Retail Hub exposes authenticated, scope-matched channel-order evidence transport with INR normalization, shadow/governed mode, idempotent receipts, and explicit write-back denial. Migration 098 and exact-match SKU mapping hold every line without an approved channel/connection/variant mapping. Migration 099 plus the `/api/v1/channel-orders` routes provide scoped mapping proposal/approval and maker/checker local-handoff evidence with optimistic versioning. The governed `execute-local` route now creates the shop-scoped local order and exact order items, deducts stock atomically, persists first-class payment evidence, and updates the channel registry with three-person segregation of duties and idempotent replay protection. Durable authenticated Hub deployment, provider pull/push, settlement reconciliation, customer/address import, and real parallel-run evidence remain open. | Commerce owner | Deploy durable transport/storage, certify mapping and handoff APIs against a live database, connect approved customer/address and payment reconciliation workflows, then produce real parallel-run evidence. |
| P1-06 | P1 | Physical device support | CERTIFICATION_REQUIRED | Network preflight is available; USB/Bluetooth/driver support is boundary-level. | Store operations | Supported-device matrix and real scanner/printer/drawer/scale evidence. |
| P1-07 | P1 | Provider/device boundaries | CERTIFICATION_REQUIRED | Banking, GST, messaging, maps, logistics and marketplace integrations intentionally fail closed without real evidence. Provider handoff packages now require the positive vault credential revision that produced the evidence, and independent verification can reject a package after rotation; real provider/device evidence is still absent. | Provider owners | Sandbox/production certification linked to the current credential revision. |
| P1-08 | P1 | UI action certification | PARTIAL | Current-build packaged automation covers the retail rail, POS restart, offline recovery/conflict recovery, intelligence, maintenance, and owner restart. Advanced/legacy workbenches and each role/action are not fully click-certified. | Product + QA | Role-by-role current-build acceptance evidence across every permitted route. |
| P1-09 | P1 | Dashboard client security | PARTIAL | The Bakaloo dashboard now uses cookie-only HTTP/Socket.IO transport: access tokens are no longer persisted in localStorage, marked login/select-shop responses omit JWTs, Socket.IO accepts the HttpOnly cookie, and protected mutations reject untrusted browser Origins. The Next.js route cookie remains advisory and live deployment/browser UAT evidence is still open. | Dashboard + Hub architecture | Deploy the cookie-only path, verify the production origin allowlist/session policy, and certify server authorization plus client fail-closed rendering in a browser. |
| P1-10 | P1 | Migration governance | PARTIAL | Bakaloo now has a deterministic filename-based migration planner, supports both SQL and JavaScript migrations, reports duplicate numeric prefixes, and binds applied rows to SHA-256 checksums with drift detection. Existing databases still require an explicitly approved legacy checksum backfill, and a live PostgreSQL dry run/restore replay remains open. | Bakaloo backend owner | Immutable ordered migration registry, applied checksum evidence, dry run and restore/replay test. |
| P2-01 | P2 | Reconciliation SLOs | PLANNED | Count, stock, money and identity variance thresholds are not business-owned. | Finance + operations | Approved thresholds, escalation policy and signed reconciliation report. |
| P2-02 | P2 | Analytics provenance | PARTIAL | Dashboard can convert unavailable data to zero and call polling live. | Analytics owner | Source, scope, freshness, definitions, drill-through and partial-data states on each chart. |
| P2-03 | P2 | Data retention and location privacy | PARTIAL | Delivery maps now refuse fabricated/default coordinates and restrict live rider telemetry to assigned orders. Customer/rider consent, DB-location retention, role visibility and deletion policy are not finalized. | Privacy owner | Approved retention policy, minimization implementation and audit proof. |
| P2-04 | P2 | Cross-platform releases | PARTIAL | Forge targets exist and the new release-matrix verifier proves same-line artifact integrity when native outputs are present, but signing, notarisation, updates and macOS/Linux visual/device certification are open. | Release engineering | `verify:release-matrix` passes for all three native artifacts, then signed build, clean-install, rollback and support evidence per platform. |

## Rules for managing this register

1. A gap may only move when a linked test, evidence artifact or approved decision exists.
2. BLOCKED means external authority, contract, credential, hardware or business decision is missing; it is never silently simulated.
3. A fix must name a business owner, data owner, migration impact, permission/approval impact, recovery strategy and rollback boundary.
4. “Implemented” does not change a certification-required gap to READY without independent evidence.

### P1-05 provider certification update (2026-08-09)

Credential-revision-bound provider certification is now implemented through
migrations 104/105 and scoped certification routes. Evidence is redacted,
checksum-bound, expiry-aware, and independently approved. Settlement posting
readiness checks this certification plus canonical local payment state but is
explicitly read-only. Real GSP/payment/marketplace credentials, signed
provider payloads, authenticated pulls, accounting posting, and independent
production evidence remain certification-required.

### P1-05 settlement posting update (2026-08-09)

The approved channel-order evidence can now be reconciled into the canonical
payment row through a credential-revision-bound, shop-scoped transaction. The
operation is idempotent, writes order payment status/history, creates an
immutable posting receipt, and audits atomically. It intentionally does not
call a provider or recognize revenue. Live credentials, signed provider
payloads, bank/marketplace settlement pulls, and independent production
certification remain required.

### P1-05 finance roll-forward update (2026-08-09)

PARTIAL remains the truthful state. Migrations 110/111 and the scoped
finance-reconciliation endpoints now bind each capture/refund receipt to one
shop financial period. Captures are deferred to delivery-based revenue
recognition; refunds apply once to a mutable delivery-day row, while missing
periods are deferred and frozen payout periods are blocked. Real provider
settlement pulls, bank matching, GST treatment, and independent production
reconciliation evidence remain open.
### P1-05 settlement evidence update (2026-08-09)

The local-execution boundary now carries optional authoritative payment
evidence, and migrations 102/103 add a scoped settlement permission plus an
append-only provider settlement workpaper. The workpaper is idempotent by
shop/provider/event identity, source-digest-bound, amount-checked, and
maker-checker approved without posting money. Live signed provider pulls,
bank matching, accounting posting, and parallel-run certification remain open.

### P1-05 refund reconciliation update (2026-08-09)

Approved provider refund evidence can now reconcile a previously posted
channel payment through a credential-revision-bound, full-refund-only
transaction. The canonical payment/order state, immutable `REFUND` ledger
entry, receipt, status history, and audit event commit together. Partial
refunds remain intentionally outside this boundary; real provider credentials,
signed refund evidence, settlement pulls, and independent production
certification remain required.

### P1-05 provider pull update (2026-08-09)

PARTIAL remains truthful. Migrations 112/113 and the scoped settlement-pull
surface now provide durable, credential-revision-bound pull receipts and an
authoritative channel-order match queue. Pulls do not call providers or post
money; real authenticated provider pulls, signed payload evidence, workpaper
promotion, bank matching, and production certification remain open.

### P1-05 settlement pull promotion update (2026-08-09)

PARTIAL remains truthful. Migration 114 now links exact pull matches to
prepared settlement workpapers with idempotent per-item promotion. Payment
posting, refund/credit-note handling, finance roll-forward, real provider
pulls, and independent production evidence remain separate gates.

### P1-05 partial refund credit-note update (2026-08-09)

PARTIAL remains truthful. Migrations 115/116/117 now provide a maker/checker,
credential-revision-bound GST credit-note contract for partial provider
refunds. Application is atomic across payment partial-refund state, immutable
ledger evidence, delivery-day financial roll-forward, receipt, and audit. The
full-refund path rejects a payment that already has a partial refund. Real
GSP/IRP filing, provider credentials, line-level return evidence, and
independent production certification remain open.

### P1-05 bank statement matching update (2026-08-09)

PARTIAL remains truthful. Migrations 118/119 and the scoped bank-reconciliation
surface now import certified INR bank/UPI/card statement evidence and produce
exact payment matches or explicit unmatched/conflict outcomes. The boundary is
idempotent, shop-scoped, checksum-bound, and audit-backed without mutating
payment or accounting state. Live bank credentials/feed pulls, finance-owner
approval, settlement posting, and independent production evidence remain open.

### P1-05 bank reconciliation approval update (2026-08-09)

PARTIAL remains truthful. Migrations 120–122 now provide independent approval,
credential revalidation, idempotent line receipts, and database invariants for
bank/UPI/card settlement evidence. The boundary still does not mutate payments
or accounting. Live feeds, finance-owner approval, provider certification, and
production reconciliation evidence remain open.

### P1-05 settlement close-readiness update (2026-08-09)

PARTIAL remains truthful. `GET /api/v1/bank-reconciliation/close-readiness`
provides explicit blockers for missing statements, pending approvals,
unmatched/conflicting credits, unapplied matches, frozen financial periods,
and unresolved provider pulls. It is read-only; live feeds, certification,
and finance-owner sign-off remain open.

### P1-05 settlement close-attestation update (2026-08-09)

PARTIAL remains truthful. A durable close-attestation workflow now captures
the exact ready snapshot, enforces maker/checker separation, uses optimistic
versions, and revalidates readiness before approval. It still does not close
the period or replace live bank/provider certification and finance-owner
sign-off.

### P1-05 GST outward-supply workpaper update (2026-08-09)

PARTIAL remains truthful. `GET /api/v1/gst-workpaper` is a read-only evidence
projection with explicit blockers and `canFile: false`. It does not submit to
GST portals or invent HSN/GSTIN evidence. HSN-level data, GSTR-1 generation,
GSP/IRP certification, and external reconciliation remain required.

### P0-05 shop-scope route coverage update (2026-08-09)

The route audit now fails closed on missing strict shop scope or missing
resource ownership proof for shop-owned prefixes. Staff routes no longer accept
a legacy body shop target without an active scope, and HQ payout mutations
perform a shop-financial resource lookup first. Remaining evidence is live
multi-shop PostgreSQL/Redis testing, historical ADMIN backfill review, and an
independent security assessment.

The repository-wide regression after this boundary passes **223 test files /
1,911 tests** with ESLint clean.

Administrator-only, shop-scoped list/rotate routes now use the vault and return
redacted revision metadata. No live provider secret, deployment key custody, or
external certification is being simulated; those remain explicit gaps.

### P0-06 provider credential vault update (2026-08-09)

The encrypted provider-credential envelope and migration 127 are covered by
unit tests and lint. The implementation is deliberately only the storage and
rotation-invalidation boundary; provider CRUD routes, deployment key custody,
real credentials, and external certification remain open.

Final post-wiring verification passes **225 test files / 1,914 tests** with
ESLint clean. Redis connection-refused logs are local-environment warnings.

### P0-06 certification revision binding update (2026-08-09)

Certification preparation and approval now fail closed unless the referenced
encrypted provider credential revision is active for the exact shop/provider/
environment. This does not provide real provider credentials or certification;
those external gates remain outstanding.
Final certification-binding verification passes **225 test files / 1,915 tests**
with ESLint clean; Redis connection-refused logs are local-only warnings.

### P1-05 GST invoice evidence staging update (2026-08-09)

PARTIAL remains truthful. The new staging contract records and validates HSN,
GSTIN, place-of-supply, and exact paise-level tax components, with maker/checker
approval and coverage blockers in the read-only workpaper. It does not solve
GSTR-1 payload generation, GSP/IRP authentication, live portal submission,
portal reconciliation, or accounting posting; those remain production gates.
The declared GST rate is now reconciled to the core tax components; statutory
cess is retained separately and still requires portal/provider certification.

### P0-05 route-scope regression update (2026-08-09)

The complete backend regression now passes **221 test files / 1,907 tests** and
ESLint is clean after strict shop-scope markers and payout resource ownership
checks were added. The remaining gap is operational evidence: live multi-shop
PostgreSQL/Redis testing, legacy ADMIN permission backfill review, and an
independent security assessment.

### P0-07 Store Edge batch replay update (2026-08-09)

The manual-only Store Edge → Hub seam now has a bounded, audited batch replay
path in Electron. It is local-first, scope-filtered, idempotency-safe, and
failure-isolated, with a permissioned IPC route and simple POS action. The
remaining gap is external: deploy the Retail Hub with real credentials and run
real-data shadow/reconciliation evidence; this code does not simulate that
gate.

### P0-08 Store Edge run-summary update (2026-08-09)

Batch replay now records durable local run summaries instead of leaving
operators to infer a run from individual receipts. This closes the local
observability gap for bounded replay, but does not close the external Hub
deployment, authenticated worker, or real-store reconciliation gates.

### P0-09 Store Edge retry-policy update (2026-08-10)

The local manual replay seam now has an explicit persisted opt-in policy with
restart resumption, bounded intervals, overlap protection, and operator-visible
controls. This closes the local retry-orchestration gap; authenticated Hub
deployment, real worker infrastructure, provider credentials, and parallel-run
reconciliation remain external gates.

### P0-10 Store Edge worker lease-renewal update (2026-08-10)

The Hub worker now renews fenced leases during long-running processing and
fails closed when a heartbeat loses ownership. Both durable PostgreSQL and
in-memory repositories enforce the current lease token and scope. Local
coverage proves renewal, stale-token rejection, and runtime heartbeat
completion. An actually deployed worker, real provider latency testing, and
production parallel-run evidence remain required.

### P0-12 Provider webhook evidence-drift update (2026-08-10)

The Bakaloo backend now fails closed when a Razorpay provider event ID is
reused with a different event type or signed-body checksum. Matching failed or
stale processing claims remain retryable, while processed duplicates remain
idempotent. Focused webhook/repository tests and the complete backend suite are
green. Sandbox replay, credential rotation, and independent production
certification remain open.

### P0-13 Capability-gated realtime shop rooms (2026-08-10)

Socket.IO shop-room membership is now capability gated. A current staff
assignment alone is insufficient: the principal must carry an explicit
operational read permission, and shop-scoped order tracking requires
`shop_orders.view`. Customer-owned orders, active rider assignments, and
canonical HQ principals retain their existing access. Focused authorization
tests pass 11/11; the complete backend suite passes 226 files / 1,921 tests
with ESLint clean. Live multi-shop deployment and independent security review
remain open.

### P0-14 Guarded provider credential runtime boundary (2026-08-10)

An internal-only provider adapter boundary now loads only the active,
shop-scoped credential revision. It authenticates the AES-GCM envelope using
the exact revision context and verifies the stored checksum before releasing
plaintext in-process. Missing, retired, tampered, or drifted credentials fail
closed; HTTP list responses remain metadata-only. Focused coverage is 10/10
and the complete backend suite is 227 files / 1,926 tests with ESLint clean.
Provider key custody, deployment, and real certification remain open.

### P0-15 Scoped dynamic attachment IPC (2026-08-10)

The three dynamic attachment IPC routes now require an active company and
branch and evaluate the client-selected resource within that scope before
touching the encrypted vault. List/add/export and merchandising image lookup
all pass the same scope; roles without the grant and cross-company or
cross-branch requests fail closed. Focused Electron coverage is 29 tests with
typecheck and ESLint clean; the full Electron suite is 246 files / 1,060
tests and the Windows x64 package builds successfully. Independent role/UAT
and packaged cross-platform evidence remain open.

### P0-16 Production native-runtime encryption gate (2026-08-10)

Electron now checks runtime database encryption evidence before opening the
protected SQLite runtime. `EPIC_BOS_REQUIRE_NATIVE_SQLITE=1` (also `true` or
`yes`) fails closed before database startup unless a certified native
page-encrypted driver reports `native-encrypted`. The default local mode stays
explicitly `interim-persisted-envelope`; this is a production gate, not a
claim that SQLCipher has been packaged. The evidence is passed into IPC health
without a second untrusted recomputation. Focused security/driver/protected
database coverage is 15/15; full Electron coverage is 246 files / 1,064 tests;
typecheck, ESLint, and Windows packaging pass. Native driver selection and
cross-platform certification remain open.

### P0-17 Governed Bakaloo delivery-map evidence surface (2026-08-10)

Epic BOS now has a provider-neutral local map surface backed by an optional
`retailDeliveryMapSignals` register. Verified coordinate projections are
plotted; live, stale, blocked, and unavailable states remain distinct. No
route, ETA, default city, or fabricated pin is generated. Six focused tests,
the complete Electron suite (248 files / 1,069 tests), TypeScript, and ESLint
pass. The remaining gap is external: importing real consented rider/device or
provider-webhook signals from the Retail Hub and reconciling them with
Bakaloo’s live delivery records.

### P0-18 Scope-bound delivery-map signal ingestion (2026-08-10)

The Hub-to-Electron delivery-map projection boundary is now validated and
durable. Normalization strips arbitrary provider fields, requires valid
timestamps/coordinates/evidence references, enforces active company and branch
scope, and makes replays idempotent. The store mutation is serialized with the
existing Revenue Ops persistence queue, while the renderer continues to see
only the safe projection. Focused coverage is 9/9; full Electron coverage is
249 files / 1,072 tests; TypeScript, ESLint, and Windows packaging pass.
Remaining: deployed Hub transport, real consent/device/provider evidence,
parallel-run reconciliation, and independent production certification.

### P0-19 Read-only Bakaloo coverage-map transport (2026-08-10)

The existing Bakaloo HQ coverage-map capability now has a strict Electron
transport. It accepts only the read-only shop/customer/pincode/boundary
projection, checks the active scope, rejects malformed or `0,0` coordinates,
limits payload size, and is exposed only through `release.control/read` IPC.
Focused transport, IPC, and renderer coverage is 23/23; the full Electron
suite is 251 files / 1,077 tests. TypeScript, ESLint, capability-registry,
IPC-policy alignment, and Windows packaging pass. The projection is rendered
in the delivery workspace with no write-back controls. Remaining: connect the
real authenticated Hub deployment and reconcile live production data.
### P0-20 Cross-platform artifact inspection pass (2026-08-10)

An unsigned Linux x64 ZIP and manifest were generated locally from the same
revision under `out-cross-linux/make/zip/linux/x64`. It is an inspection
artifact only. The Windows host did not emit a macOS artifact; native macOS
CI remains required for packaging, signing, notarisation, updates, and
device validation.
### P0-21 Vault-backed Bakaloo coverage-map Hub route (2026-08-10)

Retail Hub now has a server-owned, GET-only Bakaloo coverage-map adapter and
an authorized `/v1/admin/coverage-map/:shopId` route. Credential references
resolve only inside the Hub vault and are generation-bound; rotation during a
request discards the projection. The route requires `coverage-map:read`,
derives tenant/company/branch scope from trusted authorization, validates the
projection, and never enables write-back. Focused coverage is 18/18 and the
full Hub suite is 30 files / 149 tests. Remaining: configure the real vault,
deploy the Hub, and reconcile the live Bakaloo feed.
### P0-22 - Checksum-bound Bakaloo coverage projection (2026-08-10)

The Hub and Electron now hash the same canonical, read-only coverage payload.
The Hub emits a SHA-256 projection checksum after validation; Electron
recomputes it and rejects missing, malformed, or drifted payloads. This binds
the visual map evidence to the exact validated shop/customer/pincode/boundary
projection without exposing credentials or write-back.

Verification: focused checksum coverage **23 assertions**; full Hub coverage
**30 files / 149 tests**; full Electron coverage **251 files / 1,077 tests**;
typecheck, ESLint, and Windows packaging pass. Production vault, deployment,
live reconciliation, and native macOS/Linux certification remain open.
### P0-23 - Freshness-bound Bakaloo coverage evidence (2026-08-11)

Electron now requires and validates the Hub observation timestamp. The
receiver rejects coverage snapshots older than its bounded freshness window
(30 minutes by default) or more than two minutes in the future, while still
checking the canonical projection checksum. Stale map evidence is therefore
not presented as live operational coverage.

Verification: focused freshness/checksum coverage **3/3** and Electron
typecheck pass. Live source freshness, authenticated deployment, and
production reconciliation remain external.
### P0-24 - Native release provenance and truthful matrix gates (2026-08-11)

Manifest schema 2 records whether an artifact was built on its native target
runner. The matrix verifier accepts only native platform rows; cross and
unknown artifacts remain inspection-only. Certification packs expose the same
provenance and hold when native evidence is absent.

Verification: regenerated Windows Squirrel artifacts pass manifest checksum
verification with buildEnvironment: native. The local matrix is truthfully
blocked because native Linux and macOS artifacts are not present.
