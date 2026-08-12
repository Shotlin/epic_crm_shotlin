# Bakaloo Retail Business OS — Controlled Implementation Roadmap

## Governing rule

Every batch must state: problem, repositories affected, ADR/migration, permission and audit effect, tests/evidence, rollback path and external gates. A green unit test never substitutes for real provider, device or human acceptance evidence.

## Phase 0 — Product truth and security boundary

| Batch | Outcome | Code / documentation scope | Exit condition |
| --- | --- | --- | --- |
| 0.1 Audit baseline | Current-state report, gap register, ownership, contracts, UI IA, roadmap and registry | Epic BOS plus read-only Bakaloo audits | Documents approved; unknowns explicitly recorded. |
| 0.2 Capability truth | Generated registry and release gate command | Epic BOS scripts, package, CI, docs | Registry covers declared IPC/route surfaces; source checks are repeatable. |
| 0.3 Default-deny policy | Eliminate IPC session fallback in bounded domains | Epic BOS IPC/policy/tests | Each enabled domain has explicit scope + permission/delegation tests. |
| 0.4 Credential and data protection | Secret-scan CI, credential revision record, encrypted local DB ADR/migration plan | Epic BOS + provider policy | No secret claims; backup/restore and encryption decision evidenced. |
| 0.5 Bakaloo source quarantine | P0 backend/dashboard controls documented and tracked | Bakaloo repos, no production writes | Fake/unsafe patterns not imported; source owners accept remediation plan. |

## Phase 1 — Bakaloo Retail Core Certification

1. Cashier shift, scan/sell, GST, split tender and receipt.
2. Offline sale queue, deterministic replay, conflict and power/network recovery.
3. Return, exchange, store credit/refund and independent approval.
4. Loyalty, voucher, discount and customer eligibility.
5. Cash close, variance, review and cash/bank/UPI/card evidence.
6. Catalog/price/GST, GRN, transfer custody, cycle count, expiry/wastage and loss prevention.
7. Supported scanner/printer/drawer/scale boundary and real-device certification plan.
8. Packaged Windows journeys, then cashier/store-manager UAT and independent review.

**Exit:** all critical local retail paths pass policy, persistence, audit, automated, packaged and human evidence gates. External payment/device claims remain certification required until real evidence exists.

## Phase 2 — Retail Hub and safe Bakaloo migration

Deploy the secure Hub runtime; add identity, PostgreSQL, Redis/outbox, read-only source export, external-ID mapping, cursor/checksum/conflict handling, reconciliation reports and cutover/rollback workflow. Start real-data analytics read-only. No Bakaloo write-back.

## Phase 3 — Finance and statutory controls

Unify financial ledger/reconciliation, cash/bank/UPI/card/marketplace payout, AR/AP, GST workpapers, invoice/credit-note controls, close and audit exports. Provider/GSP claims require sandbox/production certification.

## Phase 4 — Omnichannel order and delivery

Unify POS, app, website, WhatsApp, ONDC and marketplace order lifecycle; reservation, pick/pack, dispatch, delivery, COD, RTO/refund, mapping and settlement reconciliation. Each channel uses parallel run and controlled cutover.

## Phase 5 — Customer, loyalty and growth

Deliver Customer 360, consent, wallet/gift card, segments, campaigns, support/NPS, attribution and approved channel integrations. No communication is sent without valid consent, provider evidence and attribution.

## Phase 6 — Intelligence and branch control

Demand/replenishment, expiry rescue, margin/shrinkage detection, credit policy, store/route accountability and explainable recommendations. Recommendations never change money/stock without permission and approval.

## Phase 7 — Production operations and rollout

Signed builds, auto-update, macOS/Linux/Windows test matrix, monitoring/error reporting, performance/security testing, backup/restore drills, support/runbooks, pilot rollout, provider/device conformance and controlled branch expansion. Run `pnpm verify:release-matrix` after native artifacts are collected; missing or mixed platform evidence is a hold.

## Definition of ready

A capability is READY only when its business/data owner, state model, scope/permission/SoD, persistence/migration/audit, approval/reversal, UI states, keyboard/accessibility, automated tests, packaged test, human UAT, independent review, provider/device evidence where applicable, backup/recovery, observability, rollback and registry status are current.
