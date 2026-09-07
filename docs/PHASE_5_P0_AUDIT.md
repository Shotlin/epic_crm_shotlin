# Phase 5 — P0 Correctness and Security Audit

## Repair made

`retail-command-center` previously represented absent COGS evidence as `₹0` profit and `0%` margin. That conflated “unknown” with a genuine zero.

- Aggregate known gross profit and gross margin are now nullable when no completed sale has immutable COGS.
- Per-store profit/margin follow the same rule.
- The renderer presents `—` / `Unavailable`, while still presenting real `0%` cost coverage when completed sales exist but none are costed.
- A regression test covers this case.

## Internal security/control evidence rechecked

| Boundary | Evidence |
| --- | --- |
| IPC authorization | Every declared channel has a policy; retail/revenue operations routes are scope-bound and response-projected |
| API keys | Generated with cryptographic randomness, stored as hashes, verified with timing-safe equality and company/branch/scope checks |
| Local database | Defensive SQLite settings, foreign keys, WAL, migration checksums and protected files |
| Webhooks | Signature checks and failure paths are covered by focused tests |
| Provider credentials | Main-process encrypted vault boundary exists; renderer forms must never persist secrets or expose them in dashboard state |

## Focused verification

`35` targeted tests passed across command-centre truth, metrics, IPC authorization, API-key security, database security and webhook security.

## External limits

This audit cannot certify provider sandbox credentials, live payment/GSP/IRP submissions, device transports, or Bakaloo production data. Those remain explicit external certification gates.
