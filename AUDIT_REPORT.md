# Epic BOS - Forensic Audit Report

**Date:** 2026-07-31
**Auditor:** Antigravity (takeover handoff audit)
**Canonical path:** C:\Users\MSI\Documents\Codex\2026-07-15\https-github-com-aureuserp-aureuserp-https\outputs\epic-bos
**Status:** VERIFIED

---

## 1. Project Identity

| Field | Value |
|---|---|
| name | epic-bos |
| productName | Epic BOS |
| version | 0.1.0 |
| author | Shotlin (shotlin085@gmail.com) |
| license | MIT |
| main | .vite/build/main.js |
| engine | Node >= 20.19 |
| Stack | TypeScript + React 19 + Vite + Electron 43 + Electron Forge 7 + Vitest + Zod |
| Fonts | IBM Plex Sans Variable, Sora Variable |
| Icons | Lucide React 1.24 |

Architecture: Electron Forge desktop app (NOT browser-only). Three Vite build targets: main (Electron main process), preload (context-isolated bridge), renderer (React SPA). Electron Fuses: CookieEncryption, OnlyLoadAppFromAsar, EmbeddedAsarIntegrityValidation, RunAsNode=false. Targets Windows (Squirrel), macOS (ZIP), Linux (DEB + RPM).

---

## 2. Source Module Inventory

### 2.1 src/ root
- main.ts (13.6 KB) - Electron main process
- preload.ts (49.7 KB) - Context-bridge, all API surfaces
- renderer.tsx (2.4 KB) - React entry
- index.css (305 KB) - Full design system CSS
- shell.css (65 KB) - Shell layout + navigation

### 2.2 src/domain/ - 234 files (117 modules + 117 tests)

Retail-core domain modules verified present:
- retail-pos.ts (51 KB) - B2B/B2C POS, cashier close, holds, store credit
- retail-returns.ts (43 KB) - Inspection, COGS, GST credit notes
- retail-reports.ts (118 KB) - X/Z, GST, margin, sell-through, all report types
- retail-catalog.ts (16 KB) - SKU, UOM, barcode, HSN, variants
- retail-catalog-operations.ts (12 KB) - ESC/POS, printer adapter, bulk edits
- retail-commerce.ts (21 KB) - ONDC, marketplace, channel settlement
- retail-commerce-advanced.ts (25 KB) - Settlement, conflict resolution
- retail-channel-health.ts (9.5 KB)
- retail-customer-ops.ts (14 KB) - Loyalty, LTV, RFM, consent campaigns
- retail-loyalty-promotions.ts (8 KB) - BOGO, vouchers, tier upgrades
- retail-exchange.ts (13 KB) - Replacement sale, store-credit remainder
- retail-credit-note.ts (5 KB)
- retail-interbranch.ts (8.5 KB) - Inter-branch transfers
- retail-ocr-normalization.ts (5 KB)
- retail-product-import.ts (4 KB) - CSV transactional import
- retail-forecasting.ts (4 KB) - Demand, festival multipliers
- retail-command-center.ts (6.6 KB) - Store ops aggregate
- omnichannel-inventory.ts (4.4 KB) - ATP, reservation engine
- loss-prevention.ts (5 KB) - Discount anomaly, cashier variance
- customer-engagement.ts (5.5 KB) - LTV/RFM/WhatsApp trigger
- retail-provider-readiness.ts (5 KB)
- retail-settlement-allocation.ts (5.8 KB)
- retail-settlement-withholding.ts (4.6 KB) - TDS 194H
- retail-escpos.ts (3 KB) - ESC/POS thermal payload
- pincode-serviceability.ts (23 KB)
- procurement.ts (39 KB) - PO, GRN, 3-way match, landed cost
- inventory-warehouse.ts (75 KB)
- revenue-ops.ts (72 KB) - Canonical state provider
- kernel.ts (170 KB) - Company, RBAC, approvals, audit
- crm.ts (27 KB), crm-depth.ts (19 KB), party.ts (31 KB)
- payroll.ts (32 KB), manufacturing.ts (28 KB)
- assets-maintenance.ts (119 KB) - Full fixed asset lifecycle
- financial-close.ts (19 KB), treasury.ts (24 KB)
- collections-finance.ts (40 KB), order-to-cash.ts (41 KB)
- fulfilment-control.ts (42 KB), delivery.ts (25 KB)
- statutory-control.ts (23 KB), provider-control.ts (14 KB)
- workflow-execution.ts (8.5 KB)

Plus: AI recommendations, automation schedules, COD custody, commerce performance, credit policy simulation, decision intelligence, executive pulse, MRP planning, OEE, payout workflows, project commercial, quality release, report packs, supplier scorecards, warehouse waves, webhooks, workforce lifecycle.

### 2.3 src/main/ - 73 files
- database.ts (114 KB) - SQLite schema, 36 schema version migrations
- ipc.ts (297 KB) - ALL IPC handlers (largest single file)
- ipc-authorization-policy.ts (38 KB) - Role-based IPC policy
- revenue-ops-store.ts (215 KB) - Canonical retail state store
- general-ledger-store.ts (187 KB) - Full GL + hash chain
- kernel-store.ts (24 KB) - Company/branch/RBAC/audit
- auth-service.ts (11 KB) - Session management

### 2.4 src/renderer/ - 34 files
- App.tsx (973 KB) - MONOLITHIC: entire app shell + navigation in one file
- RetailPosWorkbench.tsx (60 KB)
- RetailReturnsWorkbench.tsx (52 KB)
- RetailReportsWorkbench.tsx (102 KB)
- RetailCatalogWorkbench.tsx (27 KB)
- RetailCommerceWorkbench.tsx (15 KB)
- RetailCommerceAdvancedWorkbench.tsx (31 KB)
- RetailCatalogOperationsWorkbench.tsx (9.6 KB)
- RetailInterBranchWorkbench.tsx (8 KB)
- IndiaExecutiveDashboard.tsx (13 KB)
- CommerceExceptionWorkbench.tsx (10 KB)
- CommerceInsightsPanel.tsx (13.5 KB)
- CommercePerformancePanel.tsx (15 KB)
- CodCustodyWorkbench.tsx (26 KB)
- CollectionsCashHealthPanel.tsx (12 KB)
- GovernedControlTowerPanel.tsx (4.6 KB)
- PincodeServiceabilityPanel.tsx (22 KB)
- SystemCertificationPanel.tsx (5.9 KB)
- CashApplicationWorkbench.tsx (10 KB)

### 2.5 src/shared/ - 51 contract files
Including: retail-pos-contracts.ts, revenue-ops-contracts.ts, contracts.ts (99 KB - main IPC bridge), kernel-contracts.ts, inventory-contracts.ts, retail-commerce-contracts.ts, and 45 more.

---

## 3. Quality Gate Results (Verified)

### 3.1 TypeScript (pnpm typecheck)
RESULT: FAIL (exit code 2) - one error recorded in gate-typecheck.log:
  src/domain/retail-catalog-operations.test.ts(36,12): error TS2532: Object is possibly 'undefined'.

Fix: change line 36 from optional chain ?.payloadByteLength to non-null assertion !.payloadByteLength

### 3.2 Lint (pnpm lint)
RESULT: PASS (exit code 0) - gate-lint.log confirms clean.

### 3.3 Tests (pnpm test)
Last logged run (vitest-visit-conversion-summary.log):
  Test Files: 146 passed (146)
  Tests: 604 passed (604)
  Duration: 84.76s

Filesystem count today: 153 .test.ts + 4 .test.tsx = 157 total test files
NOTE: 11 test files were added after the last recorded full run. Fresh pnpm test required for accurate count.

### 3.4 Build (pnpm build)
RESULT: Previously passed - confirmed by out/ directories (350+ MB each).
Fresh build not run in this audit session.

---

## 4. Implemented Retail Capabilities (Source-Verified)

CONFIRMED present (source + test files both exist):
- Company/branch, RBAC, maker-checker, audit, backup/restore
- Catalog: SKU, UOM, variants, barcodes, HSN/GST, categories, brands, combos
- Pricing: price books, tiers, discounts, inclusive/exclusive GST
- Loyalty: accounts, points, accrual/redemption, Silver/Gold/Platinum tiers
- Promotions: BOGO, vouchers/coupons, campaign targeting, gift-SKU
- POS: B2C/B2B, GSTIN-aware tax, cashier custody, hold/recall, store credit, loyalty, weighted-SKU, cashier close, tender reconciliation, variance journals
- Returns: inspection, COGS-reversal, GST credit, GSTR-1 Table 9B workpaper
- Exchanges: replacement sale, store-credit remainder, credit-note reconciliation
- Catalog operations: ESC/POS printer, thermal payload, bulk edits, CSV import
- Procurement: supplier, PO, GRN, 3-way match, landed cost, reorder, OCR intake
- Inventory: bins, warehouses, batches, serials, expiry, putaway, picks, transfers
- Inter-branch transfers: outbound, dispatch, arrival, in-transit journal
- CRM: party master, consent, visits, commissions, credit-limit utilisation
- Customer engagement: LTV, RFM, churn risk, consent-governed WhatsApp triggers
- Omnichannel: connector stubs, SKU mapping, order import, settlement allocation
- Loss prevention: discount anomaly, cashier variance, refund frequency flags
- Reports: X/Z, GST, margin, sell-through, tender, category, campaign ROI, visit conversion, OCR/settlement/payout readiness
- System Certification Panel
- Pincode serviceability
- General Ledger: hash-chained journals, India COA, posting, trial balance, depreciation, assets
- Payroll, manufacturing, projects, people lifecycle

---

## 5. Missing / Incomplete (Internal)

| Area | Gap |
|---|---|
| UI completeness | App.tsx is 973 KB monolith. Many workbenches lack empty/error/loading states. |
| Omnichannel order management | Reservation engine exists domain-only; no unified order lifecycle workbench |
| Offline POS resilience | No background sync or conflict recovery |
| Multi-branch HQ controls | Custody dashboards not yet workbench-visible |
| Production monitoring | No observability beyond System Certification Panel |
| macOS/Linux release | Build configs exist; signing/notarisation not planned |
| DB encryption at rest | Explicit gap per ARCHITECTURE_PARITY_LEDGER.md |
| MFA/passkeys/SSO | Not yet implemented |

---

## 6. External Certification Gates (Cannot build without real providers)

- GSP/IRP GST filing - needs real GSP credentials
- UPI/card settlement - needs banking provider certification
- WhatsApp/DLT - needs messaging provider + DLT registration
- OCR accuracy - needs production OCR provider certification
- ONDC production - needs ONDC registration + conformance evidence
- ESC/POS hardware - needs physical printer acknowledgement
- Barcode/cash drawer/scale - needs physical device certification
- Bank/UPI payroll payout - needs live banking credentials

---

## 7. Generated / Rebuildable Artifacts

| Path | Size | Recommendation |
|---|---|---|
| out/ | 350.7 MB | Rebuildable; candidate for archival |
| out-release-windows/ | 616.9 MB | Keep as release evidence or archive |
| out-general-ledger-hardening/ | 349 MB | Archive or delete |
| out-stabilisation-auth-nav/ | 348.9 MB | Archive or delete |
| out-workspace-refresh/ | 348.9 MB | Archive or delete |
| .vite/ | 3.6 MB | Delete freely |
| tmp/ | 3.2 MB | Delete freely |
| output/ | 0 MB | Delete |
| vitest-*.log, build-*.log, etc. | ~3 MB | Keep as audit evidence |

Total stale out-* directories: ~1.7 GB rebuildable storage.
See CLEANUP_PROPOSAL.md before deleting.

---

## 8. Previous Claims vs. Verified Reality

| Claim | Reality |
|---|---|
| "157 test files" | CONFIRMED: 153 .test.ts + 4 .test.tsx = 157 |
| "654 passing tests" | UNVERIFIED: last logged run = 604 tests / 146 files. Fresh pnpm test needed. |
| "TypeScript passing" | FAIL: one TS2532 error in retail-catalog-operations.test.ts:36 |
| "Lint passing" | CONFIRMED: gate-lint.log exit 0 |
| "Electron build passing" | CONFIRMED: multiple out-* dirs prove prior success |
| "5 new pillar domain files" | CONFIRMED: all 5 files present in src/domain/ |

---

## 9. Immediate Actions Required

### Fix #1 - TypeScript error (5 minutes)
File: src/domain/retail-catalog-operations.test.ts, line 36
Change: state.retailLabelPrintDispatches[0]?.payloadByteLength
To:     state.retailLabelPrintDispatches[0]!.payloadByteLength

### Fix #2 - Run fresh quality gates
pnpm typecheck  (must exit 0 after fix)
pnpm lint       (should remain clean)
pnpm test       (get verified test count)

### Next Wave
Begin Omnichannel Order Management and Inventory Truth as specified.

---

## 10. Do Not Touch

- epic_crm_shotlin/desktop/, server/, webapp/ - separate old project, do not merge
- Any existing test file - do not delete
- Ledger files - update only with verified facts
- Provider certification status - never mark external gates complete without evidence
