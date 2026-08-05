# Epic BOS store recovery and offline-operation runbook

## Purpose and current boundary

Use this guide after a store network or power interruption, a POS synchronization conflict, or a database recovery event. It is designed to protect sales, cash, stock, and audit evidence; it is not a substitute for a completed hardware or disaster-recovery certification.

Current capabilities are deliberately bounded:

- Offline POS sales are queued with an idempotent transaction key and payload checksum.
- A cashier can synchronize their own queued sales. An independent supervisor recovering another cashier's queue must provide a recovery-evidence reference, which is persisted with the attempt.
- Sync failures become explicit conflicts; they do not silently become completed sales.
- Interactive backup/restore verifies SQLite integrity and required Epic BOS tables before staging a restart.
- A network preflight is only a bounded TCP connectivity check. USB Web Serial is diagnostic only. Native USB and Bluetooth drivers, real device acknowledgements, and hardware certification are not yet implemented.

Never delete queue records, edit the SQLite file manually, or treat a printer/scanner/scale connection light as proof that a sale or command completed.

## 1. First response at the counter

1. Keep the counter safe: preserve receipts, tender slips, cash-count evidence, and the time of the interruption.
2. Record an incident or recovery reference before a supervisor acts on another cashier's work.
3. Do not re-enter a transaction merely because the network disappeared. First check the offline queue and the sale record after connectivity returns; transaction keys are meant to prevent duplicate checkout.
4. If power loss affected a device, visually inspect cash-drawer state, receipt paper, and scale condition. Do not claim a device acknowledgement without an actual response from its approved driver.
5. Escalate immediately if cash, stock, customer payment, or data-integrity evidence is missing.

## 2. Recover and reconcile the offline sales queue

Use the POS/offline queue view to make the queue state visible before retrying anything.

| Queue state | Meaning | Operator action |
| --- | --- | --- |
| `queued` | A local sale awaits normal checkout processing. | Cashier may sync their own queued sale. A supervisor needs recovery evidence to sync another cashier's queue. |
| `syncing` | A sync attempt has been started. | Wait for the resulting state; do not submit a duplicate transaction. |
| `synced` | Checkout completed and the queue item points to a sale record. | Reconcile the tender, receipt, stock movement, and sale reference. |
| `conflict` | The payload checksum or normal checkout validation failed. | Investigate and resolve explicitly; it is not a completed sale. |
| `discarded` | An independent supervisor recorded a discard decision with recovery evidence. | Retain the reason and reconcile the physical/payment evidence. |

### Normal recovery pass

1. Restore a stable network connection and reopen Epic BOS.
2. Review the queue plan: queued, synced, conflicts, and discarded items must be visible to the recovery lead.
3. Allow the cashier to synchronize their own queued sales first.
4. For an independent recovery pass, enter a specific recovery-evidence reference. The system stores the recovery actor, mode, evidence reference, attempt time, and outcome.
5. Use bounded batches only. The current implementation accepts 1–50 queued sales per pass, so stop and review after each batch rather than attempting an uncontrolled bulk replay.
6. Reconcile each `synced` item against its POS receipt/tender evidence and resulting sale record before closing the incident.

### Conflict handling

1. Read the conflict reason; checksum mismatch means the persisted payload no longer matches its queue evidence and must not be silently replayed.
2. Compare the transaction key, receipt/slip, payment terminal result, cashier statement, stock position, and expected sale record.
3. A supervisor who is not the cashier that queued the sale must enter the incident, count-sheet, or payment-reconciliation reference before choosing one recorded resolution:
   - **Requeue** when the original sale remains valid and can safely be retried through normal checkout.
   - **Discard** when the transaction must not be posted. Record the precise reason and complete any separate cash/stock correction under its governed workflow.
4. Reconcile any customer payment or physical stock difference before closing the conflict. A discarded queue item is not an automatic refund, reversal, or stock adjustment.

## 3. Backup and database restore

### Create a verified backup

1. In Epic BOS, invoke the interactive backup action and choose a protected location.
2. Retain the receipt: filename, created timestamp, SHA-256, byte size, and verification timestamp.
3. Store the backup outside the live workstation where access is restricted and recovery ownership is known.
4. Do not rely on a file copy alone as a verification. The backup service performs an online SQLite backup and inspects integrity before it records the receipt.

### Restore a database

1. Stop normal store activity and name a recovery lead. Capture the reason for restore and the selected backup's checksum.
2. Use only the interactive restore action; it checks `PRAGMA integrity_check` and confirms the required Epic BOS tables before proceeding.
3. Read the confirmation carefully. The app creates a pre-restore safety backup, stages the selected database as `.restore-next`, then schedules an application restart.
4. On startup, Epic BOS applies the staged restore and archives the previous active database with a `.before-restore-<timestamp>` suffix. Do not manually rename the live database or the staging files.
5. After restart, manually verify the company/branch scope, ability to sign in, current queue plan, recent sales/tender totals, stock exceptions, and the backup receipt. Record the outcome in the recovery incident.

### Restore drills

Epic BOS now provides **Run isolated restore drill** in the Backup and restore control. It creates an online backup, copies it into a temporary second database, verifies SQLite integrity and required Epic BOS tables on both copies, reports both checksums, and removes the temporary files. It never stages or replaces the active database. Record the returned receipt as local recovery evidence, including its pass/fail status and timestamp.

Run this drill in addition to a controlled non-production store recovery exercise. A passed isolated SQLite drill proves the database backup/copy boundary only; it does not by itself prove that real devices, payments, offline queues, or provider connectors recovered correctly.

## 4. Physical device recovery

Before relying on a physical device, record the store, device code, manufacturer/model, serial number, connection method, protocol/driver version, and an independent test reference.

| Device path | What exists today | What it does not prove |
| --- | --- | --- |
| Network printer/scanner/drawer/scale | Short-lived TCP preflight with bounded response metadata. | A real print, scan, drawer pulse, weight reading, or device certification. |
| USB | User-initiated Web Serial diagnostic evidence can be captured. | Native USB driver support, production command transport, or a hardware acknowledgement. |
| Bluetooth | No native discovery, pairing, driver, or command transport is implemented. | Any Bluetooth hardware readiness. |
| Manual evidence | A governed evidence record can be prepared/independently acknowledged. | A device response that was not actually received. |

For an outage involving hardware:

1. Mark the device unavailable at the counter and use the approved manual fallback only if business policy allows it.
2. Preserve any terminal receipt, printer diagnostic, scale ticket, or device log reference.
3. Do not reuse a prior response checksum/reference for a different command; the evidence flow rejects replayed response evidence.
4. Escalate USB/Bluetooth work to the hardware integration owner. Select the exact device models and supported protocols before adding a native driver. Real hardware tests remain mandatory.

## 5. Recovery evidence packet

Attach or reference the following without exposing secrets or raw customer data:

- incident/recovery reference, store, counter, and operator roles;
- outage start/end time and the recovery decision maker;
- offline queue state before and after recovery, transaction keys, and conflict resolutions;
- cash/tender, receipt, stock, and payment-terminal reconciliation references;
- backup filename, SHA-256, verification time, restore safety-backup filename, and post-restart checks;
- device model/serial, protocol/driver version, command/evidence identifiers, and actual acknowledgement/failure references;
- provider credential revision only (never the secret) when an external connector was involved.

Credential rotation invalidates the corresponding provider approval evidence. Re-run connector conformance after rotation; do not use an old approval to close a recovery or release incident.

## 6. Hard stops and escalation

Keep the store in a controlled hold and escalate to the release/recovery owner when any of these occur:

- an offline conflict lacks a defensible payment, receipt, or stock reconciliation;
- a backup fails integrity checks, required-table checks, or post-restart verification;
- data is missing after a staged restore;
- a device has only TCP/Web Serial/visual evidence but a real command acknowledgement is required;
- a provider credential has changed since its last approval;
- banking, UPI/card, GST/IRP, marketplace, WhatsApp, payroll, or logistics evidence needs live provider access.

The safe response to an unresolved condition is to hold the affected counter, device, connector, or release scope—not to mark it complete.
