# Bakaloo capability cutover runbook

Epic BOS must replace Bakaloo capability by capability. This procedure never changes the live Bakaloo application or writes to its production data during shadow review.

## Required sequence

1. **Shadow** — pull read-only records and retain external IDs, cursor, source checksum, and local checksum.
2. **Parallel** — run Epic BOS beside Bakaloo for the selected capability; do not route customers or stock authority yet.
3. **Reconciled** — record a zero-difference reconciliation with a checksum and inspectable evidence reference.
4. **Approved** — a different authenticated reviewer approves the reconciliation.
5. **Rollback window** — a different operator performs the controlled cutover and records the rollback deadline.
6. **Retired** — only after the rollback deadline passes without an unresolved incident may the old capability be retired.

If reconciliation differs, a reviewer rejects the transition or an incident occurs, block or roll back the capability. Create a new reviewed plan after correction; never resume a blocked or finished plan in place.

## Capability order

Use this order unless the release owner documents a safer dependency:

| Order | Capability | Authority after cutover |
| --- | --- | --- |
| 1 | Analytics | Epic BOS read-only reports |
| 2 | Catalog and inventory | Epic BOS catalog/stock truth |
| 3 | Orders | Epic BOS order queue and reservation |
| 4 | Delivery | Epic BOS fulfilment and custody evidence |
| 5 | Finance | Epic BOS settlement and accounting evidence |

The cutover state machine is implemented in `src/domain/retail-cutover.ts` and uses `src/shared/retail-cutover-contracts.ts`. The domain layer is deliberately side-effect free: the authorized IPC/repository layer must persist each transition with audit evidence and scope checks.

## Non-negotiable holds

- No real provider credentials or live write endpoint is used during shadow import.
- A credential rotation invalidates the related provider approval evidence.
- A zero-difference count without source/local checksums is not reconciliation.
- A successful local transition is not production certification, payment approval, device certification, or legal/statutory acceptance.
- Keep the Bakaloo rollback path operational until the recorded window closes and an independent reviewer signs off.
