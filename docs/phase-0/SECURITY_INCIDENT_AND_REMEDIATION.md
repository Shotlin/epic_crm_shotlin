# Bakaloo Retail Business OS — Security Incident and Remediation Register

## Status

No current credential incident can be declared closed from source review alone. The business security owner must confirm provider/key inventory, rotation, revocation and deployment evidence. This document prevents a false closure claim.

## Immediate containment decisions

- No credential from Bakaloo or Epic BOS is copied into the Electron renderer, browser localStorage, test fixtures, screenshots, Git history or this repository.
- Epic BOS continues to use credential references and encrypted local records, but its secret/history scan and full local business-data encryption are not yet complete.
- Bakaloo source is read-only during migration. No live write capability is enabled by the audit work.
- The dashboard's simulated MFA, static recovery codes, fixed QR and fictional rider-map fallback are not valid controls and must be quarantined before production use.
- The Bakaloo backend's legacy ADMIN, Socket.IO room access, webhook verification and immutable-finance assumptions are P0 blockers.

## Required incident workflow

| Step | Required evidence | Current state |
| --- | --- | --- |
| Inventory | Provider, key identifier, owner, scope, environments, last rotation, storage location | BLOCKED — requires business/security owner input |
| Source/history scan | Redacted scan of all branches/tags/history and CI artifacts | PLANNED |
| Rotation | Revoke/rotate impacted secrets, invalidate old credential revision and record outcome | BLOCKED — requires provider access |
| Session invalidation | Revoke affected sessions/API keys and require re-authentication | PARTIAL — local mechanisms exist; Hub/backend evidence not complete |
| Assessment | Scope, data-access implication, remediation owner and reviewer | PLANNED |
| Closure | Independent review links scan, rotation and regression tests to a date/version | BLOCKED |

## Security engineering work in this milestone

1. Add redacted repository/history secret scanning to CI.
2. Define a credential inventory schema that stores a non-secret reference and revision only.
3. Bind provider/device certification evidence to credential revision; a rotation invalidates old approval evidence.
4. Remove Electron IPC session fallback through explicit policy coverage.
5. Select and test encrypted local database storage with backup/restore rollback.
6. Do not connect any provider until its raw request/signature, scope, retry, audit and reconciliation contract is verified.

## External inputs still required

Selected GSP/IRP, bank/UPI/acquirer, messaging/DLT, map/routing, logistics, ONDC/marketplace and device providers; their credentials; approved sandbox/test accounts; actual supported hardware; named business/security owner; independent reviewer; retention and data-residency direction. These are gates, not implementation defects that can be simulated away.
