# Bakaloo Retail Business OS — Production Exit Programme

## Operating rule

Epic BOS and the live Bakaloo app, site, backend, and dashboard remain
separate until each capability has passed a read-only shadow run,
reconciliation, approval, controlled cutover, and rollback window. No phase
may replace live Bakaloo behaviour through a demo, placeholder, or unchecked
provider response.

## Phase 0 — Scope protection and evidence baseline

**Status:** complete

- Freeze the retail-only product boundary, preserve live Bakaloo production,
  classify demo/legacy surfaces, and maintain the gap register.
- Exit evidence: current architecture report, release hold policy, capability
  registry, source audit and rollback rules.

## Phase 1 — Canonical identity, tenancy, and realtime authorization

**Status:** in progress

- Make the current user record and active outlet assignment the authority for
  HTTP and Socket.IO, not a historic `ADMIN` claim.
- Restrict live order tracking and rider telemetry to the customer, assigned
  rider, active outlet, or canonical HQ role; eliminate the global legacy admin
  room.
- Wire resource-level outlet scope across every shop-owned route and certify
  negative cross-shop cases against PostgreSQL and Redis.
- Exit evidence: multi-shop integration suite, route-coverage guard, Socket.IO
  room evidence and independent security review.

## Phase 2 — Native local encryption and credential lifecycle

**Status:** in progress

- Replace the interim persisted-file envelope with a certified encrypted SQLite
  runtime that protects database pages, WAL, journals and temporary files.
- Implement operator-governed key rotation for the OS-wrapped master key,
  provider records, attachments, backups and credential revision evidence.
- Exit evidence: clean install, migration, rotation, crash recovery and native
  Windows/macOS/Linux proof using the selected driver.

## Phase 3 — Payment integrity and immutable money

**Status:** in progress

- Verify Razorpay and future payment webhook signatures against exact received
  bytes; store idempotency, replay and reconciliation evidence.
- Complete append-only financial records, reversal/approval rules, refund
  contract unification, settlement matching and GST-safe audit trails.
- Exit evidence: sandbox webhook replay, reconciliation workpapers and finance
  owner approval.

## Phase 4 — Truthful maps, serviceability, delivery and privacy

**Status:** planned

- Reuse Bakaloo's Leaflet/OpenStreetMap visual foundation, PIN/radius
  serviceability, shop coordinates and delivery assignment model.
- Create a provider-neutral Retail Hub map adapter for governed geocoding,
  optional routing and live-location ingress; never call public Nominatim
  directly from Electron.
- Add an append-only consent-bound location ledger, freshness states, accurate
  outlet/rider scopes and no fictional pins, 0/0 defaults or fake ETA claims.
- Exit evidence: real imported location data, role/privacy review, delivery
  evidence and map-provider policy approval.

## Phase 5 — Retail Hub runtime and operational resilience

**Status:** planned

- Deploy Fastify, PostgreSQL, Redis, durable queues, encrypted credentials,
  observability, backups and recovery for the Retail Hub.
- Keep Electron local-first with append-only receipts, governed outbox,
  idempotency, retry, conflict and recovery controls.
- Exit evidence: authenticated non-production deployment, migration/replay,
  queue failure, backup/restore and monitoring drills.

## Phase 6 — Read-only Bakaloo shadow import

**Status:** planned

- Import shops, staff, catalogue, inventory, customers, addresses, orders,
  payments, wallets, vouchers, riders, delivery, settlements, campaigns,
  reviews and content using external IDs, checksums and cursors.
- Reconcile counts, money, stock, identity and delivery state before any
  write-back is enabled.
- Exit evidence: approved snapshot import, variance report, conflict register
  and rollback rehearsal.

## Phase 7 — Unified omnichannel order truth

**Status:** planned

- Make POS, website, mobile app, WhatsApp, ONDC and marketplaces converge on
  a single event/outbox, SKU mapping, stock reservation, cancellation, return,
  RTO and settlement model.
- Cut over one channel capability at a time after parallel-run reconciliation.
- Exit evidence: channel-specific order and stock variance within approved
  thresholds, approval and rollback evidence.

## Phase 8 — Store devices and offline operation

**Status:** planned

- Certify scanner, ESC/POS printer, cash drawer and weighing-scale adapters
  across approved USB, Bluetooth and network hardware.
- Complete offline sale, sync queue, conflict resolution, power/network-loss
  recovery and branch recovery drills.
- Exit evidence: supported-device matrix, hardware acknowledgement logs and
  cashier/store-manager recovery sign-off.

## Phase 9 — Premium UX certification and legacy retirement

**Status:** planned

- Certify every role, route, submodule, form, button, loading/error/empty
  state, calculation, export and mobile/narrow viewport.
- Remove or quarantine retail-irrelevant legacy screens, simulated MFA/map
  states and fictional demo data after a classified review; preserve auditable
  migration fixtures outside the production user path.
- Exit evidence: role-by-role current-build acceptance pack and accessibility
  review.

## Phase 10 — Cross-platform release and observability

**Status:** planned

- Produce native Windows, macOS and Linux packages, then sign, notarise,
  verify auto-update, instrument monitoring/error reporting and complete
  clean-install/rollback release runbooks.
- Exit evidence: all three native artifacts pass the release-matrix verifier,
  signed release proof and platform-specific launch/device evidence.

## Phase 11 — Provider certification and controlled production cutover

**Status:** blocked by external credentials and business approvals

- Certify GSP/IRP, banking/UPI/cards, messaging/DLT, logistics, ONDC and
  marketplace providers against credential revisions.
- Execute pilot outlet rollout, parallel operation, disaster recovery drill,
  independent approval, controlled cutover and a monitored rollback window.
- Exit evidence: provider sandbox/production records, business owner approval,
  signed release decision and recovery evidence.

## Completion definition

The programme is complete only when every open item in `GAP_REGISTER.md` has
linked automated, packaged, human, provider/device and recovery evidence.
External credentials, hardware and approvals are explicit gates; they are not
simulated in code.
