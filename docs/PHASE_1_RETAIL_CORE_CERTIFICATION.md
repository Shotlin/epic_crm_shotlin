# Phase 1 Retail-Core Certification

**Started:** 2026-08-04  
**Scope:** sell-to-return and stock-to-cash controls in the Epic BOS Electron application.  
**Status:** automated source gates and three packaged Electron journeys passed; critical role-based retail acceptance is still required.

## What this phase certifies

Phase 1 does not add decorative features. It verifies that the retail controls most likely to create a financial, stock, or customer-service loss behave predictably before later work connects live Bakaloo data or providers.

| Critical control | Automated source evidence | Human evidence still required |
| --- | --- | --- |
| Counter shift, sale, GST, tender and receipt | `src/domain/retail-pos.test.ts` | Cashier opens a shift, scans a real permitted SKU, completes a cash and digital tender sale, and compares the receipt with saved sale, stock and GST effects. |
| Return and exchange | `src/domain/retail-returns.test.ts` | Cashier requests an eligible return; a different store manager approves or rejects it and validates the resulting credit, refund and stock evidence. |
| Offline store recovery | `src/domain/retail-offline-sync.test.ts` | Cashier queues a sale during a real network interruption; manager recovers it and verifies one checksum-validated result after reconnect. |
| Catalog, barcode, pricing and GST rules | `src/domain/retail-catalog.test.ts` | Store manager changes an approved catalog record and confirms that an inactive or invalid record cannot be sold. |
| Cash closure and variance | `src/domain/retail-cash-overview.test.ts` | Cashier declares closing cash; an independent manager reviews a variance and leaves inspectable evidence. |
| Branch custody and store execution | `src/domain/retail-interbranch.test.ts`, `src/domain/retail-store-execution.test.ts` | Store manager creates, approves, dispatches and receives a transfer; stock moves only at the correct custody stage. |
| Loyalty and vouchers | `src/domain/retail-loyalty-promotions.test.ts`, `src/domain/retail-pos.test.ts`, `src/domain/retail-offline-sync.test.ts` | Cashier applies a valid benefit and attempts an invalid one; customer balance, order total, GST effect and immutable voucher evidence are checked. |
| X/Z, tender, GST, margin and sell-through reporting | `src/domain/retail-reports.test.ts` | HQ/finance chooses an outlet/date range and reconciles a report total to the underlying sales, tenders and returns. |

## Automated result for the current source tree

Run on 2026-08-04:

```text
pnpm.cmd exec vitest run \
  src/domain/retail-pos.test.ts \
  src/domain/retail-returns.test.ts \
  src/domain/retail-offline-sync.test.ts \
  src/domain/retail-catalog.test.ts \
  src/domain/retail-cash-overview.test.ts \
  src/domain/retail-interbranch.test.ts \
  src/domain/retail-store-execution.test.ts \
  src/domain/retail-loyalty-promotions.test.ts \
  src/domain/retail-reports.test.ts \
  --config vitest.config.ts --reporter=dot

Test Files  9 passed (9)
Tests       88 passed (88)
```

The type checker, renderer interaction tests, and ESLint also passed in this delivery. Automated tests validate deterministic business rules and component wiring; they do not validate a payment provider, a printer, a physical scanner, staff comprehension, or a real store recovery.

## Latest verification expansion

The current tree has also passed `pnpm.cmd typecheck`, `pnpm.cmd lint`, `git diff --check`, and the full **239-suite / 1,011-test** regression gate. The packaged Electron evidence now includes owner enrollment/restart, rendered POS checkout/restart, and retailer navigation through all eight plain-language workspaces and all **31** retail submodule actions. The navigation journey also verifies the actual `.main-content` scroll owner, Ctrl/Cmd-K command-palette focus, narrow-width horizontal overflow, mobile rail open/close semantics, visible-button accessible names, and renderer error capture.

The owner E2E journey verifies the real preload, registered IPC, atomic owner provisioning, persistence, and reauthentication seam. The POS E2E journey completes a real INR 118 cash sale, confirms stock movement from 20 to 19, checks receipt and balanced local accounting evidence, and verifies it after a fresh Electron process starts. Those checks do **not** yet substitute for a human cashier sale, return/exchange, cash-close, offline recovery, or role-specific acceptance journey; those remain Phase 1 requirements.

## Required Phase 1 evidence

The existing `UI_ACCEPTANCE_CATALOG` provides the controlled role journeys. The following are Phase 1 release blockers:

1. Complete the cashier missions for POS shift, cash checkout, loyalty/voucher, receipt, offline queue and return request.
2. Complete the store-manager missions for shift close, variance, return decision, catalog, offline recovery, transfer, warehouse and procurement controls.
3. Each tester records an inspectable evidence reference against the active release identity.
4. A different authenticated reviewer verifies each result. A maker cannot approve their own evidence.
5. Failed, rejected or stale evidence blocks the release until the journey is repeated on the current build.

## Exit decision

Phase 1 may be marked complete only when the automated suite is green **and** the relevant current-build cashier/store-manager evidence is independently verified in the Release control room. Until then its correct status is **in progress**, not production-ready.
