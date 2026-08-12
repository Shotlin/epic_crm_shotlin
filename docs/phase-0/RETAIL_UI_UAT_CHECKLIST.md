# Retail UI / User-Acceptance Certification Checklist

Status: **prepared for independent execution**  
Scope: Epic BOS Electron retail workspaces and the packaged Windows build  
Package revision: `ui-certification-2026.08.06.1`

This checklist is the manual complement to the automated retail navigation journey. It must be executed by a person who did not implement the screen, using a clean test workspace and the role named in each section. Record evidence for every failure; do not mark a workflow passed because a page merely rendered.

## Evidence rules

- Record build revision, OS, viewport, role, workspace status, and timestamp.
- Capture the action path, expected result, actual result, and screenshot or exported evidence.
- Use INR test data only. A test record must be clearly marked `Demo` or `Imported`; never use Bakaloo production data in this checklist.
- Verify loading, empty, validation-error, permission-denied, success, retry, and offline states where the action supports them.
- A destructive action must show its confirmation, audit reference, and rollback/reversal path.
- A workflow is **pass** only when the visible result, persisted state, audit event, and role boundary all agree.

## Cashier / POS operator

- [ ] Sign in and confirm the active outlet and `Demo`/`Imported` workspace badge.
- [ ] Open Sell; search a product, scan/type a barcode, change quantity, and remove a line.
- [ ] Apply a permitted discount, voucher, and loyalty redemption; verify GST and INR totals.
- [ ] Complete cash, UPI, card, store-credit, and split-tender checkouts.
- [ ] Confirm receipt preview/print handoff, sale number, tax breakup, and customer ledger effect.
- [ ] Start an offline sale, close/reopen the app, replay it, and verify idempotency/conflict messaging.
- [ ] Request a return/exchange; verify approval gating, credit note, replacement sale, and stock effect.
- [ ] Open the cash register, record a payout, close the shift, and verify variance evidence.

## Store manager

- [ ] Review the Home command centre: sales, stock risk, expiry, delivery, loyalty, and cash variance cards.
- [ ] Approve/reject discounts, returns, exchanges, credit, stock adjustments, and transfer exceptions.
- [ ] Create or edit a customer, consent, address/contact point, voucher, and loyalty tier action.
- [ ] Create a purchase request/PO, receive a GRN, perform a three-way match, and inspect landed cost.
- [ ] Create a bin transfer, batch/serial adjustment, cycle count, and reorder recommendation.
- [ ] Assign delivery, verify proof-of-delivery/COD custody, and resolve an exception.
- [ ] Export X/Z, GST, tender, margin, sell-through, campaign, and stock reports in INR.

## Finance / controller

- [ ] Review sales, returns, credit notes, GST breakup, tender totals, and cash variance.
- [ ] Verify AR/AP postings, customer credit-limit approval, write-off controls, and settlement evidence.
- [ ] Review bank/UPI/card and marketplace settlement matching boundaries; confirm unconfigured providers fail closed.
- [ ] Inspect audit history, approval segregation, document numbering, fiscal period, and branch scope.
- [ ] Run backup creation, restore preview, and recovery evidence checks without touching production data.

## HQ administrator

- [ ] Create a company, outlet/branch, warehouse, user, role, and field-level permission.
- [ ] Verify cross-company and cross-branch reads are denied unless explicitly permitted.
- [ ] Rotate a credential version and confirm prior provider approval evidence is invalidated.
- [ ] Review integrations, sync cursors, conflicts, import receipts, and reconciliation reports.
- [ ] Inspect deployment readiness; unsafe or missing TLS/auth/database/vault/observability controls must fail closed.

## Accessibility and usability sweep

- [ ] Every visible control has a readable label, tooltip, or accessible name.
- [ ] Keyboard navigation reaches the command palette, rail, dialogs, tables, forms, and primary actions.
- [ ] At 700px width there is no horizontal overflow; the mobile rail opens/closes correctly.
- [ ] The main content area is the only vertical scroll owner; no nested-scroll trap blocks the operator.
- [ ] Charts include titles, units, legends, readable labels, and an accessible tabular/export alternative.
- [ ] Empty, loading, error, and permission states explain what to do next in plain language.

## Sign-off

| Role | Tester | Build / OS | Passed | Failed | Evidence link | Date |
| --- | --- | --- | ---: | ---: | --- | --- |
| Cashier |  |  |  |  |  |  |
| Store manager |  |  |  |  |  |  |
| Finance/controller |  |  |  |  |  |  |
| HQ administrator |  |  |  |  |  |  |

Human sign-off does not certify live provider integrations, hardware, or production cutover. Those remain separate gates requiring credentials, devices, deployment access, and rollback evidence.
