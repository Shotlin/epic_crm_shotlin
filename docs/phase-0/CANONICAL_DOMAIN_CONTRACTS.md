# Bakaloo Retail Business OS — Canonical Domain Contracts

These are the governing contracts for all new Hub, Store Edge and dashboard work. Existing records are adapted; no new duplicate truth is introduced.

## Required command envelope

~~~ts
type CommandEnvelope<T> = {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  tenantId: string;
  companyId?: string;
  outletId: string;
  actor: { userId: string; sessionId: string; roleIds: string[] };
  occurredAt: string;
  expectedVersion?: number;
  source: "store-edge" | "dashboard" | "provider" | "migration";
  payload: T;
};
~~~

Commands fail closed if scope, permission, state, expected version, idempotency or approval requirements fail. They return a typed operational state rather than inventing an external acknowledgement.

## Required event envelope

~~~ts
type DomainEvent<T> = {
  eventId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  tenantId: string;
  outletId: string;
  correlationId: string;
  causationId?: string;
  actorId?: string;
  occurredAt: string;
  checksum: string;
  payload: T;
};
~~~

Events for stock, money, wallet, loyalty, accounting and audit facts are append-only. Corrections use explicit reversal/adjustment events that reference the original event. An outbox publishes committed events; an inbox deduplicates received events.

## Required import record

~~~ts
type SourceRecord<T> = {
  sourceSystem: "bakaloo";
  entityType: string;
  externalId: string;
  sourceRevision?: string;
  updatedAt?: string;
  observedAt: string;
  cursor?: string;
  checksum: string;
  payload: T;
  status: "observed" | "mapped" | "conflict" | "reconciled";
};
~~~

Shadow import is GET-only until a capability has passed parallel run, reconciliation, independent review and a time-bounded rollback plan.

## Core aggregate rules

| Aggregate | Canonical operations | Invariants |
| --- | --- | --- |
| Product / variant | Create, version, approve, activate, retire | SKU/barcode uniqueness per policy; effective dates; no destructive mutation of sold snapshot. |
| Inventory position | Receive, reserve, release, pick, dispatch, receive transfer, count, adjust, waste, reverse | Movement ledger is append-only; quantity never changes without a reason/evidence; no negative sellable stock unless an approved policy permits it. |
| Sale / unified order | Create, price, tender, authorize, complete, cancel, return, exchange, fulfil | Status transitions are deterministic; tender total, GST and allocation balance; payment/provider status is independently evidenced. |
| Shift / cash close | Open, tender record, declare, review variance, close, reopen by approval | One open shift per counter; no silent cash adjustment; close variance is signed/evidenced. |
| Payment / refund / settlement | Prepare, provider handoff, verify, reconcile, allocate, reverse | Refund cannot exceed eligible paid amount; financial facts are ledger entries, not mutable totals. |
| Customer / consent | Identify, merge, address, consent, revoke, segment | Identity merge is reviewable; consent is purpose/channel/version/evidence-bound. |
| Loyalty / wallet | Accrue, reserve, redeem, expire, reverse, credit/debit | Balance derives from immutable entries; redemption is atomic and idempotent. |
| Delivery / COD | Allocate, pick, dispatch, track, deliver, return/RTO, remit, reconcile | No fabricated ETA/location/POD; location is role/consent/freshness governed. |
| Approval | Submit, approve, reject, expire, withdraw | No self-approval when SoD policy forbids it; decision contains version and evidence. |

## Canonical state vocabulary

Every screen and API maps facts to one of these clear states:

- Draft, submitted, approved, rejected, posted, completed, reversed, cancelled
- Pending provider evidence, provider accepted, provider failed, reconciliation required
- Offline, queued, syncing, synchronized, conflict, stale, partial, unavailable
- Demo, imported, live, certification required, read-only

The state word “live” is reserved for provider-backed, scope-valid, fresh data. It is never a visual shortcut for a poll timer or fixture.

## Cross-system contract requirements

1. API and event versions are additive first, versioned and contract-tested.
2. Every external call has timeout, retry, retry-safe idempotency and durable failure evidence.
3. Every integration uses a vault credential reference and immutable credential revision. Rotating a credential invalidates older approval/certification evidence.
4. Reports disclose tenant/outlet scope, query time, data source, definition, freshness and drill-through path.
5. A migration record contains external ID, Epic ID, checksum, cursor, mapping decision, conflict decision, reviewer, source revision and rollback window.
