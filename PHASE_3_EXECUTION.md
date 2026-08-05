# Phase 3 execution — close, reliability, and production readiness

Status: started after the Phase 2C asset-lifecycle slice.

Phase 3 is the hardening layer that turns the broad business workflows into a production-grade operating system. It is intentionally sequenced after the asset lifecycle domain so close, reporting, sync, and operations consume stable evidence rather than UI-only records.

## 3A — Financial close and source reconciliation

- **3A.1 delivered — canonical close-readiness proof.** Every ledger period now exposes aggregate readiness evidence: supported source drafts require an actively posted canonical journal, uncertified legacy drafts require an explicit export, every journal draft blocks close, and posted reversals are checked for a valid original. The Electron ledger cockpit renders the period window, posted/source counts, and the first actionable blockers. A reversal journal cannot itself be reversed, preserving one-directional correction evidence. This is the first close gate, not a claim that AR/AP, GST returns, payroll, treasury, or consolidation close is complete.
- **3A.2 delivered — collections statutory handoffs.** Independently approved receivable write-offs now enter the canonical book through a checksum-bound bad-debt/receivables adapter. Recognized customer TDS and company-collected TCS entries now enter through a policy-, PAN-, account-, scope-, and amount-validated statutory adapter. Both are replay-safe, maker/checker separated, visible in the General Ledger source bridge, and included in close-readiness evidence; company-deducted TDS remains a statutory workflow without a GL draft until its payroll/AP source boundary is certified.
- **3A.3 delivered — treasury and bank evidence handoffs.** Released/settled supplier payments, recorded/reconciled bank charges, and released/settled liquidity sweeps now enter the canonical book only after exact source checksum, bank-account scope/currency, supplier-invoice scope, lifecycle status, journal identity, account, amount, and open-period validation. The Electron ledger bridge exposes one replay-safe treasury action for all four source types; canonical source identities are distinct and close-readiness only clears after the resulting immutable journal posts.
- **3A.4 delivered — manufacturing inventory/WIP handoffs.** Production material issues and production outputs now have a replay-safe canonical adapter that rechecks work-order scope, source journal identity, posting date, exact cost, inventory/WIP accounts, balance, and open period.
- **3A.5 delivered — landed-cost valuation handoff.** Approved, costed goods receipts now have a replay-safe inventory-versus-clearing adapter that rechecks receipt/allocation scope, approved lifecycle, allocation sum, exact account totals, balance, checksum, and open period.
- **3A.6 delivered — people-control handoffs.** Finalized payroll runs and reimbursed employee expenses now have replay-safe canonical adapters that recheck frozen totals, lifecycle, journal identity, exact payroll/statutory or employee-expense/cash accounts, scope, balance, checksum, and open period.
- Complete canonical adapters for impairment/revaluation, landed cost, treasury, inventory/manufacturing, payroll/expense, write-offs, withholding, and statutory close.
- Add AR/AP subledger roll-forwards, cost centres/dimensions, budgets, period lock/reopen, P&L, balance sheet, cash flow, FX revaluation, consolidation, and GSTR-1/2B/3B workpapers.
- Every close assertion must trace to an immutable source journal, reversal pair, or governed exception; no aggregate is allowed to hide an unlinked control-account movement.

## 3B — Local-first reliability

- **3B.1 delivered — operator health probe.** The main process now exposes a permission-checked operational health snapshot covering SQLite integrity, audit-chain verification, migration checksum shape, pending/failed outbox work, and audit volume. Health is classified as healthy, degraded, or critical and is safe to query after restart.
- **3B.2 delivered — deterministic replay planning.** A permission-checked replay-plan endpoint orders unsent events by occurred-at plus event ID, classifies retryable failures, duplicate aggregate conflicts, and exhausted retry budgets, and returns a persisted revision checkpoint without mutating the outbox.
- Signed outbox, deterministic replay, conflict classification, recovery checkpoints, backup/restore drills, and migration compatibility tests.
- Structured logs, health probes, audit-chain verification, performance budgets, crash recovery, and operator-visible incident timelines.

## 3C — Experience completion

- Replace remaining placeholder/disabled commands with real empty, loading, success, and error states.
- Responsive Electron layouts for compact windows, keyboard paths, accessible labels, focused modal flows, and end-to-end tests for every visible primary action.
- Add contextual readiness labels so certification-required adapters are visibly distinct from production-ready workflows.

## 3D — Certification and ecosystem

- Provider conformance packs for selected GSP/IRP, banking, messaging, payroll, and logistics adapters.
- Signed releases, update channels, API keys/scopes, webhooks with idempotency/signature/retry, connector health, and mobile/portal contracts.

## Phase 3 exit gate

The product advances to vertical packs only when close/reopen/reversal, restore/replay, multi-company isolation, UI critical paths, observability, and provider certification suites are green. A feature is not marked complete because a screen renders; its evidence journey must survive restart, migration, restore, reversal, and an authorization change.

Current continuation evidence: 3A.7 financial reporting workpapers, 3B.3 signed replay checkpoints, 3B.4 controlled replay execution, and 3B.5 audited conflict recovery are implemented and regression-tested. Production provider certification and the full exit gate remain open.

Additional 3A evidence: AR/AP roll-forward and GST output/input workpaper projections are now derived from governed invoices, receipts, supplier invoices, payment proposals, and canonical journal evidence, and are visible in the Finance cockpit.
