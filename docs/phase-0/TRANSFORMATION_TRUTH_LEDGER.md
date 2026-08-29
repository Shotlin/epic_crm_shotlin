# Epic BOS retail transformation truth ledger

**Baseline revision:** `e7e6436f4cd16ba39761cc62feab87f9a7bc146f`
**Baseline date:** 2026-08-13 (Asia/Kolkata)
**Authoritative contract:** `CODEX_MASTER_PROMPT_EPIC_BOS_TRANSFORMATION.md`
**Visual reference:** the eight 1600 × 1000 retail workspace mockups supplied with the transformation contract.

This is a truth ledger, not a marketing status report. A capability is only marked complete when its behaviour, controls, and relevant evidence are proven in the current source and test run.

## Current source boundary

- Electron + React renderer with Vite/Forge packaging.
- Local domain/application state is persisted through the desktop database boundary; privileged work is exposed through a typed IPC contract.
- `src/renderer/App.tsx` remains a large central orchestration surface and is the primary Phase 2 decomposition target.
- The source contains 555 declared IPC channels and a generated capability registry with 565 records.
- The public retail surface already has many domain workbenches, but it does not yet consistently use the eight work-first shell/workspace layouts specified by the mockups.

## Baseline validation

| Gate | Result | Evidence / action |
| --- | --- | --- |
| Capability registry check | Failed at baseline | The generated registry had an older source revision. It was regenerated on 2026-08-13; re-run the full suite before any phase is closed. |
| IPC policy alignment | PASS (2026-08-13) | 540 permissioned handlers checked. |
| Renderer copy policy | PASS (2026-08-13) | Renderer copy encoding check. |
| TypeScript / hub typecheck / lint | PASS (2026-08-13) | Electron and Retail Hub typechecks plus ESLint. |
| Packaged Electron exercise | PASS | Windows package, smoke, POS, offline, maintenance, intelligence, visual, owner restart, and navigation journeys pass in the final multi-process batch. |

## P0 findings confirmed in current source

| ID | Finding | Evidence | Required disposition |
| --- | --- | --- | --- |
| P0-COST-001 | SKU and category reports multiply total line COGS by quantity a second time. | `src/domain/retail-reports.ts` used `line.costValue * line.quantity` in both report paths, while POS completion writes the inventory issue total to the line. | Repair reports; make the total-line-cost semantic explicit; add quantity, weighted, return, category/SKU-to-sale reconciliation invariants. |
| P0-REG-001 | Generated capability registry was stale. | `pnpm run verify:retail-core` stopped at `verify:capability-registry`. | Regenerated artifact; retain it in the next committed checkpoint and re-run full verification. |
| P0-DATA-001 | Runtime SQLite encryption-at-rest is not currently proven. | Existing registry identifies protected backup envelopes but not encrypted active runtime storage. | Internal design/test work may continue; production rollout remains externally/security blocked until a chosen encrypted runtime path is implemented and certified. |
| P0-PROVIDER-001 | Provider, map/GPS, bank, statutory, hardware, and live-store evidence is incomplete. | Existing readiness registries and the supplied audit. | Preserve adapters and explicit states; do not claim live certification. |

## Retail-workspace state at the freeze

| Workspace | Domain surface exists | Contract visual front door | Status |
| --- | --- | --- | --- |
| Home | Command-centre/domain projections exist | Retail front door implemented; semantic package evidence green | Implemented / pixel capture pending |
| Sell | POS, returns, catalog and pricing workbenches exist | Cashier front door, returns action and POS restart journey package-verified | Implemented / pixel capture pending |
| Stock | Inventory, replenishment, purchase, transfer and expiry workbenches exist | Unified stock front door with exact Warehouse/Procurement/Expiry handoffs | Implemented / pixel capture pending |
| Deliver | Delivery control/map/order workbenches exist | Source/freshness/evidence-safe dispatch front door package-verified | Implemented / pixel capture pending |
| Customers | Customer 360, loyalty, campaigns and data-quality surfaces exist | Customer 360 front door with tabs and truthful states | Implemented / pixel capture pending |
| Money | Cash, settlements, GST and close workbenches exist | Cash/settlement/close front door with exact finance handoffs | Implemented / pixel capture pending |
| Insights | Reporting/command projections exist | Reconciled executive front door and intelligence route package-verified | Implemented / pixel capture pending |
| Setup | Device, certification, backup and control workbenches exist | Guided setup front door with destination-specific controls | Implemented / pixel capture pending |

## Non-negotiable acceptance gates

1. Renderer UI must never become an authority for money, inventory, approval, or permissions.
2. No KPI may render fabricated fallback values. Unknown, stale, failed, offline, shadow, and provider-unavailable states must be explicit.
3. A visual change must be captured and compared at the supplied 1600 × 1000 reference viewport before its workspace gate can close.
4. A financial/inventory change must have a source reconciliation test before its phase gate can close.
5. External provider/device/statutory/live-store evidence remains a separate certification status from internally production-ready code.

## Phase 0 exit checklist

- [x] Authoritative contract and visual references read.
- [x] Source tree, renderer, domain, IPC and release scripts inspected.
- [x] Initial P0 defect and stale generated artifact identified.
- [ ] Full governed validation suite rerun after registry regeneration (blocked at Vitest startup in the restricted runner).
- [x] Current packaged UI capture recorded (8 real 1600 × 1000 PNGs plus JSON evidence in `test-evidence/visual/0.1.82-final7`).
- [ ] Final capability/gap matrix reconciled to current source.
- [ ] Checkpoint committed.

## Current execution evidence — 2026-08-14

- `pnpm.cmd typecheck` — PASS.
- `pnpm.cmd lint` — PASS.
- Capability registry — PASS (565 records).
- IPC policy alignment — PASS (540 permissioned handlers).
- Renderer-copy encoding check — PASS.
- Elevated Electron packaging — PASS (`out/Epic BOS-win32-x64`).
- Packaged Windows smoke — PASS (`EPIC_BOS_SMOKE_OK`).
- Packaged retail navigation — PASS (8 primary routes, 31 submodules, one scroll owner).
- Packaged POS checkout/restart — PASS (cash sale, return inspection, close and restart persistence).
- Packaged offline recovery and conflict recovery — PASS in the same rebuilt artifact run.
- Visual harness captures real compositor pixels for all eight workspaces at 1600 × 1000 in `test-evidence/visual/0.1.82-final7`; semantic/layout assertions pass and renderer errors are empty. Pixel-parity scoring against the static references is intentionally **not run** and remains a human/design-review gate.
- Focused retail front-door unit suite — PASS (9 files / 28 tests).
- Complete multi-process Electron E2E batch — PASS (8 files / 8 tests; navigation covers all 8 routes and 31 submodules).

The remaining product gates are not hidden by this evidence: native macOS/Linux artifacts and signing, provider/device/statutory credentials and certification, live Retail Hub shadow import/reconciliation, hardware drivers, native page-encryption certification, and human role-by-role UAT remain external or separately certifiable work.
