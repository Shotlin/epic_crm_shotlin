# Phase 4 provider-certification handoff

This checklist is intentionally separate from local engineering completion. The release evaluator keeps production readiness blocked until every selected provider supplies evidence that can be independently reviewed.

## Evidence packet required for each provider

- Provider domain: GSP/IRP, banking, payroll, messaging, or logistics.
- Provider and contract reference, including the legal entity and branch scope.
- Named credential owner and secret-rotation contact.
- Sandbox credentials and a dated sandbox test report.
- Test-case references covering authentication, happy path, validation failure, timeout/retry, duplicate/idempotency, and reconciliation/pull behavior where applicable.
- Production approval reference and an independent approver who did not perform the implementation.
- Production credential activation record only after the preceding evidence is accepted.

## Acceptance sequence

1. Record the handoff through the provider-certification contract and validate the packet.
2. Run the connector conformance cases against the provider sandbox; preserve request/response evidence with secrets redacted.
3. Confirm webhook signatures, replay windows, idempotency, scope boundaries, and pull reconciliation behavior.
4. Obtain independent approval and record the production approval reference.
5. Record the `provider-certification` release gate in Control Room.
6. Re-run the complete release readiness evaluator. A single missing, failed, or deferred provider packet must keep readiness blocked.

Until this sequence is complete, Epic BOS may be used in local and controlled pilot environments, but must not claim certified production transmission authority for that connector.
