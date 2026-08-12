# Bakaloo Retail Business OS — Current-State Architecture Report

**Audit date:** 2026-08-08  
**Decision:** Epic BOS is a substantial local retail foundation. It is not yet a safe replacement for Bakaloo's live commerce platform. The correct next move is a controlled, read-only migration programme—not a big-bang merge or a second dashboard.

## Scope and evidence

| Repository / runtime | Evidence reviewed | Current truth |
| --- | --- | --- |
| Epic BOS Electron | 651 tracked files; Electron/Vite main, preload, renderer, local stores, tests and packaging configuration | Local-first Store Edge foundation with a broad retail workflow surface. |
| Epic BOS Retail Hub | TypeScript read-only shadow-import contracts, PostgreSQL repository seam and tests | A library-level shadow-import boundary; not a deployed Fastify, PostgreSQL, Redis or webhook service. |
| Bakaloo Dashboard | 76 browser routes, 49 API service modules, unit/property/Playwright tests | Useful cloud-admin client patterns; not a replacement for Electron and not production-certified. |
| Bakaloo Backend | Fastify, PostgreSQL, Redis, BullMQ, Socket.IO, 49 modules, 91 SQL migrations and 145 test files | The existing live-system source during migration. It contains valuable retail records and several P0 control gaps. |

The workspace intentionally contains uncommitted implementation and evidence
changes; this report does not claim a clean source commit. On 2026-08-08, the
bounded Electron runner and reconciled final groups passed **246 test files /
1,057 tests** in 11 batches after the native-attestation nonce guard;
the post-change native-device boundary regression passed **4 files / 76 tests**,
followed by the nonce replay guard regression at **9 tests**.
Retail Hub verification is now **27 files / 126 tests**, with TypeScript,
ESLint, renderer-copy, capability-registry and IPC-policy checks green. The
current Windows 0.1.81 package is an unsigned local artifact with verified
installer and isolated smoke evidence. Human UAT,
native macOS/Linux evidence, signing, monitoring, provider/device certification
and production approval remain required for any release claim.

## Actual system map

~~~text
Store team / HQ operator
        |
        v
Epic BOS Electron Store Edge
  - local POS, cash, inventory, device and offline evidence
  - encrypted attachments/provider records, ordinary local SQLite business DB
  - Electron IPC and RBAC boundary
        |
        | future authenticated, idempotent sync only
        v
Epic BOS Retail Hub
  - intended canonical cloud coordination and reconciliation layer
  - currently read-only shadow-import contracts, not a deployed service
        |
        | read-only during migration
        v
Bakaloo Backend + PostgreSQL/Redis
  - current live catalogue, orders, customers, wallet, delivery and settlement source
        ^
        |
Bakaloo Dashboard browser client
  - current cloud administration client; must not become a second owner of retail facts
~~~

## What Epic BOS already proves locally

| Capability family | Source evidence | Truthful status |
| --- | --- | --- |
| Retail register | POS, GST, tender, loyalty, voucher, return and exchange domain/workbench tests | Built locally; cashier and manager packaged-UAT remain open. |
| Inventory and purchase | Catalog, batches, expiry, GRN, transfers, replenishment and cycle-count workflows | Built locally; Bakaloo reconciliation and shop-floor evidence remain open. |
| Customer operations | Party, CRM, consent, customer, campaign and loyalty workflows | Built locally; Bakaloo identity/import and provider evidence remain open. |
| Cash and finance boundaries | Cash-close, settlement, ledger, GST and evidence workflows | Local controls exist; bank, payment, GSP/IRP and external close evidence are open. |
| Delivery and devices | Delivery, COD, offline queue and device adapter boundaries | Boundary-ready only. Real providers and hardware are not certified. |
| Release controls | Backup, audit, artifact metadata, release and acceptance evidence stores | Local release framework exists. Signing, update, monitoring, recovery and cross-platform evidence are open. |

## Current technical strengths

- Electron has context isolation, sandboxed renderers, a trusted-sender check, disabled arbitrary navigation, a CSP, a single-instance protection and a narrow preload bridge.
- The local application persists an audit-oriented state model, backup/restore data, encrypted attachments and encrypted provider-secret records.
- The retail rail already centers retail tasks: Home, Sell, Stock, Deliver, Customers, Money, Insights and Setup.
- The Retail Hub contracts already model external IDs, cursors, checksums, conflicts, review decisions and cutover assessment, and its source adapter is HTTPS/GET-only.
- Bakaloo's live backend already contains important retail concepts: outlets, catalog, variants, shop stock/pricing, customers, orders, payments, wallet, riders, delivery, promotions, payouts and settlements.

## P0 architecture and control gaps

| ID | Evidence | Why it blocks production use |
| --- | --- | --- |
| P0-01 | The current policy alignment check covers 537 permissioned handlers; only three attachment channels remain intentionally delegated through encrypted metadata and active scope. | Dynamic attachment channels still require negative role, company/branch scope, projection and regression evidence. |
| P0-02 | Epic BOS business SQLite uses ordinary SQLite/WAL. | The main retail database still has an interim plaintext runtime window, but its persisted envelope, backups, provider/statutory credentials, MFA factors, and attachments are protected by an OS-vault-backed versioned keyring and envelope migration. Native encrypted SQLite pages, OS master-key retirement, crash-window proof, and cross-platform evidence remain open. |
| P0-03 | Retail Hub now has a fail-closed startup boundary, durable repository/worker seams and read-only shadow-import APIs, but no authenticated Fastify/PostgreSQL/Redis deployment, queue runtime, webhook intake or live source connector. | It cannot yet coordinate live Store Edge, Bakaloo, provider or mobile traffic; deployment and real shadow-import evidence remain open. |
| P0-04 | Bakaloo Dashboard uses browser localStorage tokens and includes simulated MFA, a fixed map fallback and “Live” presentation with polling. | These are not valid production identity, location or freshness controls and must not be adopted. |
| P0-05 | Bakaloo Socket.IO now re-checks account/session/outlet scope during handshake and restricts rider telemetry to assigned active orders. Real multi-shop Socket.IO/PostgreSQL/Redis evidence remains open. | Local negative coverage exists; production real-time isolation is not yet certified. |
| P0-06 | Canonical platform/outlet role and scope checks now protect shared auth, product, staff, financial and transaction paths; route-by-route resource-scope adoption remains incomplete. | Cross-shop isolation is improved but cannot yet be treated as complete for every endpoint. |
| P0-07 | The canonical Razorpay path now verifies exact raw bytes with constant-time HMAC, requires event IDs, records a durable replay ledger and rejects out-of-order failure downgrades. Applied migration, sandbox replay and settlement/reconciliation evidence remain open. | Payment webhook integrity is locally covered, but production certification is not complete. |
| P0-08 | Append-only financial protections and idempotent trigger migration evidence exist in source, but the governed migration runner, restrictive production grants, reversal model and live reconciliation drill remain open. | Money/audit immutability is not yet proven in the deployed database. |

**P0-04 superseding status (2026-08-08):** The dashboard transport is now
cookie-only for HTTP/Socket.IO, MFA is server-enforced with encrypted factors
and one-use challenges, and map/GPS surfaces reject fabricated or stale
coordinates. Live deployment, browser UAT, recovery-code evidence and provider
GPS consent/retention approval remain open. The older wording above is retained
only as historical audit context and must not be read as the current state.

## Duplicate-truth risks to resolve before migration

| Fact | Current conflict | Target decision |
| --- | --- | --- |
| Order items | Backend stores both order JSON and order_items. | Define one canonical order-line projection and a verified migration. |
| Stock | Legacy products.stock_quantity and outlet shop_products.stock_quantity coexist. | Retail Hub owns canonical catalog; Store Edge owns physical local movements; Hub reconciles outlet stock. |
| Finance | Aggregates coexist with shop transaction records. | An immutable event/ledger is canonical; aggregates are rebuildable projections only. |
| Refunds | Dashboard has two incompatible refund flows. | One backend-enforced refund, approval and reversal contract. |
| Identity / roles | Browser/client permissions and legacy ADMIN semantics differ from real outlet scope. | Hub-owned canonical identity, scopes, role grants and session revocation. |

## Non-production claims that remain forbidden

Do not describe a state as live, settled, printed, delivered, GST-filed, payment-confirmed, mapped, provider-certified, device-certified or production-ready until an independent evidence record proves it. Demo, preview, unavailable, stale, offline and partial states must remain visible to the operator.

## Audit conclusion

The implementation should now move through the Phase 0 controlled batches in
IMPLEMENTATION_ROADMAP.md. The local release-matrix integrity verifier is now
available; Windows and a checksum-verified Linux ZIP exist, while native Linux
smoke/signing and macOS artifacts remain open. Next executable work remains
bounded to local security/release controls and packaged certification; no live
Bakaloo write, provider credential use, data deletion or dashboard replacement
is authorized by this report.
## Native device bridge boundary (2026-08-08)

Native USB/Bluetooth driver results are deliberately main-process-only. The
renderer cannot submit or edit a native acknowledgement, and generic operator
evidence is rejected for `native-driver-required` profiles. A future signed,
store-approved bridge must call the internal service seam with bounded driver
identity and response metadata. Web Serial/Web Bluetooth remain diagnostic
paths; they do not constitute native driver or production hardware support.

Native responses additionally require a signed Ed25519 envelope. The signed
message binds the immutable device profile/version, command checksum, response
metadata, driver identity, timestamp, and nonce. The approved profile's public
key fingerprint must match, and the signature must be within the bounded clock
window. This proves evidence integrity when a real bridge is supplied; it does
not certify a driver or physical device by itself.
