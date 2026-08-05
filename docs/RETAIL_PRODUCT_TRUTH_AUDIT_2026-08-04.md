# Epic BOS Retail Product-Truth Audit

**Date:** 2026-08-04  
**Scope:** Electron desktop application at `outputs/epic-bos`  
**Decision:** Epic BOS is a strong retail operating-system foundation, not yet a credible replacement for a mature live retail stack without the proof gates below.

## What this audit means

This is a source, test-catalogue, and architecture audit. It is not a claim that a human has completed every cashier, manager, finance, and administrator journey on a packaged release. A journey is only certified after a real tester records release-specific evidence and an independent reviewer verifies it.

## Current product truth

| Area | Evidence present now | Truthful status |
| --- | --- | --- |
| Retail POS, GST, returns, exchanges, loyalty, vouchers | Domain commands, Electron workbenches, automated tests | Built; needs human role/action certification and live payment/device proof |
| Inventory, purchasing, batches, expiry, transfers, replenishment | Domain workflows, controlled workbenches, automated tests | Built; needs real stock/import reconciliation and store-floor testing |
| Customer, CRM, consent, campaigns, loyalty | Party and CRM workbenches, governed state, automated tests | Built; needs Bakaloo data import and real channel/provider proof |
| Cash, settlements, collections, GST and ledger controls | Local workflow and evidence boundaries | Partially production-ready; banking, GSP/IRP, and settlement-provider evidence are still external gates |
| Delivery, COD custody, ONDC/marketplace boundaries | Governed workflow, source checksum and conflict controls | Boundary-ready; not live omnichannel execution until providers are connected and reconciled |
| Offline and device controls | Queue/recovery and adapter boundaries | Boundary-ready; real barcode/scanner/printer/drawer/scale certification is outstanding |
| UI and accessibility | Retail-first rail, task labels, chart components, protected legacy state and 48 UAT journeys | Improved and role-gated; not fully visually or behaviorally certified across every screen and role |
| Backup, audit, release controls | Local persistence, evidence model, package smoke and one real packaged Electron close/restart journey | Built locally; full recovery, signing, update, monitoring and cross-platform release evidence is incomplete |

## Static audit findings and decisions

| ID | Finding | Risk | Decision |
| --- | --- | --- | --- |
| PT-01 | The historical Northstar/USD CRM bootstrap exists in `src/domain/crm.ts` and can survive in an old local database. | A prior demo can look like live business data. | Keep only as a narrow, one-way migration recognizer until old workspaces have been safely reset or migrated. Never recreate it automatically. |
| PT-02 | A guarded reset exists in `BakalooRetailDemoResetPanel.tsx` and requires a verified backup plus the exact phrase `RESET BAKALOO`. | Automatic deletion could destroy user data if legacy provenance is ambiguous. | Preserve this safety boundary. A known demo can be reset; an unclassified workspace must be reviewed, not silently erased. |
| PT-03 | First-run enrollment previously offered a fictional sample workspace. | New operators can mistake fictional data for their business. | Removed from the production enrollment UI in this delivery. New accounts always begin clean. The sample provisioner remains an internal test/demo seam only. |
| PT-04 | Several old generic workbenches remain under advanced controls. | A cashier can be confused by non-retail terms or reach a broad workbench instead of a task. | Corrected at the rail boundary: the first eight retail tasks stay direct, and specialist workbenches fail closed unless the signed-in policy explicitly grants them. |
| PT-05 | The retail rail contained labelled submodules that reopened their parent overview rather than the detailed workbench that owns the task. | An operator can believe a button is broken or cannot find the actual control. | Corrected in this delivery: every current rail submodule now routes to its owning workbench. Phase 3 will add fine-grained in-workbench anchors where several tasks share one governed surface. |
| PT-06 | The app has a 48-journey role-based acceptance catalogue, but automated tests cannot substitute for signed human UAT. | A green test suite can still hide confusing, inaccessible, or device-specific behavior. | Make verified acceptance evidence a release hold. No `ready` claim without current-build, maker/checker-reviewed evidence. |
| PT-07 | External provider adapters intentionally fail closed without credentials and proof. | Pretending banking, GST filing, maps, messaging, marketplace, or hardware is live would be unsafe. | Retain the boundary; certify with real sandbox/production accounts and signed test evidence only. |
| PT-08 | Older callers could still pass `starterMode: sample` to the provisioning boundary even though the normal first-run UI no longer offered it. | Fictional records could be recreated through a stale or custom client. | Corrected: the public bootstrap contract and IPC accept only `clean`, and the provisioner defensively creates a clean workspace even when handed an obsolete malformed request. |
| PT-09 | The POS voucher field accepted arbitrary text into a local "applied" display without changing the atomic checkout input. | A cashier could believe a discount was accepted when no governed price, GST, tender, usage-count, or audit effect existed. | Corrected: checkout now accepts one scoped code/version pair, validates it against persisted data, allocates the discount before GST, records immutable sale evidence, and increments usage only after completion. Offline replay revalidates the same pair. |
| PT-10 | Package smoke had not previously driven a real visible Electron business journey across restart. | Renderer mocks can miss preload, registered IPC, SQLite, or reauthentication defects. | Corrected for clean owner onboarding: a packaged Windows E2E path now proves visible enrollment, SQLite integrity, close, relaunch and sign-in. POS, return, cash-close and role-specific packaged journeys remain the next expansion. |

## Immediate remediation made in this delivery

- The first-owner screen is now **clean-workspace only**. It no longer exposes fictional sample records as an operator choice.
- The production bootstrap contract and IPC schema now reject sample provisioning. The provisioner itself also fails closed to clean state for a malformed legacy caller.
- Existing workspaces are not auto-deleted. Known generic demos retain the backup-first reset route; unclassified data remains blocked from automatic external writes.
- A legacy sample workspace now displays a protected cleanup notice rather than the former demo scenarios, sample imports, or client-demo action panels.
- The unreachable demo scenario, handoff, mock communication, generic catalog, fake readiness, and sample-import panels have been physically removed from the renderer. The protected backup-first legacy reset remains.
- The simple retail front doors now genuinely hand off to their detailed workbenches, and every expanded left-rail option has a tested task destination instead of reopening the same overview.
- Advanced extensions are now derived from the current user's policy; a cashier sees no unrelated generic ERP rail, while a workspace owner receives the explicit advanced set.
- Voucher input is no longer a local success state. It is pending until atomic checkout validates the persisted scoped version, taxes, tender, stock and immutable redemption evidence.
- A direct return-to-exchange regression now covers independent approval, exact top-up, replacement sale, credit settlement and cost evidence.
- The POS retains all configured tender rails after a successful sale, including customer credit.
- The acceptance framework remains release-identity-bound so a prior build's review cannot be reused for a changed build.

## Current verification baseline

Run on the current source tree on 2026-08-04:

- `pnpm.cmd typecheck` - passed.
- `pnpm.cmd lint` - passed.
- `pnpm.cmd test -- --reporter=dot` - **227 suites / 952 tests passed**.
- `pnpm.cmd test:e2e:electron` - **1 packaged Electron journey passed**: visible owner enrollment -> clean workspace -> graceful close -> SQLite integrity/migration/credential/guard proof -> same executable relaunch -> visible sign-in -> same clean workspace.

This is a meaningful proof-tier increase, not a production declaration. Real cashier/store-manager UAT, packaged POS/return/cash-close journeys, Bakaloo shadow reconciliation, provider/device evidence, signing, and recovery drills remain open.

## The eight-phase operating SOP

### Phase 0 — Product truth and safety baseline

**Goal:** know exactly what is real, what is a fixture, what is legacy compatibility code, and what needs external evidence.

**Exit gate:** no demo data is reachable from a normal first-run flow; each active retail surface has an owner, data provenance, test coverage status, and a safe removal/migration decision.

### Phase 1 — Retail-core certification

**Goal:** certify sell-to-return and stock-to-cash workflows before adding more features.

**Journeys:** open shift, scan/sell, discount/loyalty/voucher, payment, receipt, offline queue, return/exchange, cash close, price/catalog change, GRN, transfer, cycle count, expiry and reorder.

**Exit gate:** automated domain/IPC/renderer tests plus independently verified cashier and store-manager evidence for every critical journey.

### Phase 2 — Bakaloo data truth and safe migration

**Goal:** build the shadow-import path without touching Bakaloo production writes.

**Scope:** catalog, variants, stock, customers, addresses, orders, payments, wallet/refunds, vouchers, delivery, riders, settlements, campaigns, reviews, and storefront content; external IDs, checksums, cursors, conflicts, reconciliation reports.

**Exit gate:** read-only import reconciles counts, money, GST, stock and customer identities with a reviewable variance report and rollback plan.

### Phase 3 — Simple premium UX and interaction certification

**Goal:** turn every retail option into one obvious task while preserving advanced controls through progressive disclosure.

**Scope:** direct submodule destinations, clear primary actions, one scroll owner, responsive layouts, keyboard/focus behavior, empty/loading/error/success states, visual data cards, drill-down charts, and understandable labels.

**Exit gate:** every route and action is click-certified by role; no disabled-looking active action, dead-end button, clipped layout, generic demo copy, or unexplained chart remains.

### Phase 4 — Omnichannel orders and delivery execution

**Goal:** establish a single, auditable order and stock truth across POS, Bakaloo app/site, WhatsApp, ONDC and marketplaces.

**Scope:** durable events, SKU mapping, reservation, cancellation, return/RTO, fulfilment, rider assignment, proof of delivery, COD custody, settlement reconciliation, map/serviceability adapters.

**Exit gate:** parallel-run reconciliation and controlled cutover evidence for each channel. No fabricated location, ETA, or provider acknowledgement.

### Phase 5 — Indian finance and statutory control

**Goal:** make every rupee, settlement and tax outcome explainable.

**Scope:** counter cash, UPI/card/bank/marketplace matching, commissions and payouts, credit and collections, GST workpapers, e-invoice/e-way-bill/GSP boundaries, TDS/TCS where applicable, period close and audit exports.

**Exit gate:** sources-to-ledger reconciliation, controlled corrections, closing workpapers and provider certification evidence.

### Phase 6 — Store hardware, offline resilience and branch accountability

**Goal:** work safely on the actual shop floor.

**Scope:** certified scanner/printer/cash-drawer/scale adapters, offline sale queue, idempotent background sync, conflict resolution, network/power recovery, inter-branch custody and loss-prevention alerts.

**Exit gate:** repeatable recovery drills on real supported hardware and an independently checked store recovery runbook.

### Phase 7 — Intelligence, production operations and rollout

**Goal:** turn verified operating data into useful decisions and operate the product safely at scale.

**Scope:** demand/replenishment/expiry/margin intelligence, customer engagement, executive command centre, observability, error reporting, signed Windows/macOS/Linux releases, updates, security testing, backup/restore DR, support and deployment runbooks.

**Exit gate:** signed release matrix, current-role UAT, performance/security/recovery evidence, provider/device conformance, controlled branch rollout, and a rollback window.

## Non-negotiable evidence rule

For any workflow to be described as **ready**, it must have all of the following:

1. Scoped data ownership and privacy classification.
2. Permission and segregation-of-duties rules that fail closed.
3. Create, review, approve/post/close, and governed correction/reversal behavior.
4. A simple Electron journey with clear feedback, error recovery, and accessible keyboard behavior.
5. Domain, IPC/persistence, and renderer tests; then a packaged-app smoke check.
6. Role-based acceptance evidence verified by a different person for the current release.
7. Real provider/device certification evidence whenever a live external claim is involved.

## Competitive position

Epic BOS has an unusually broad retail-control foundation and can differentiate through local-first resilience, auditability, simple operator flows, and Bakaloo-specific omnichannel control. It is not honest to claim it already exceeds TallyPrime, Zoho, or GoFrugal: those products have mature real-world integrations, deployed support workflows, and proven operational usage. Epic BOS earns a superior claim only after the above evidence gates are satisfied with Bakaloo data and real stores.
