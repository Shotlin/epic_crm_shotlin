# Bakaloo Retail Business OS — Target Architecture

## Architecture decision

Build one Bakaloo retail operating system with three purpose-specific runtimes. They share canonical contracts and visual standards, but they do not duplicate data ownership.

| Runtime | Purpose | May own | Must not own |
| --- | --- | --- | --- |
| Epic BOS Store Edge | Store and HQ operator desktop application | Local POS session, shift/cash evidence, physical scan/device evidence, local inventory movement, offline command queue and recovery evidence | Cloud customer profile, online order truth, provider credentials or direct ungoverned backend writes |
| Epic BOS Retail Hub | Cloud coordination kernel | Canonical cloud product/customer/online-order/loyalty/wallet facts, identity/authorization, sync, reconciliation, external mappings, provider evidence and integration outbox | Store-only physical device truth without an incoming audited event |
| Bakaloo Dashboard | Cloud-admin experience | Presentation, task orchestration and read-model interaction | Durable retail facts, secrets, client-only authorization or a second ERP dataset |

## Safety-first migration model

~~~text
Bakaloo current source
  -> approved GET-only export adapter
  -> immutable shadow-import batch
  -> external-id map + cursor + checksum
  -> conflict / variance review
  -> maker-checker acceptance
  -> capability-specific parallel run
  -> cutover with rollback window

No automatic write-back occurs during shadow import.
~~~

Each capability migrates independently in this order: read-only analytics, catalog/inventory visibility, order operations, customer operations, delivery, finance/settlement and finally storefront/mobile write paths. The current Bakaloo production platform remains the source until each cutover has reconciled and been independently accepted.

## Security boundary

- The renderer and browser are untrusted presentation layers.
- Retail Hub owns external credentials; no provider key enters Electron renderer storage, browser localStorage, screenshots or source.
- Store Edge uses an authenticated, scoped local session and a default-deny IPC manifest.
- Hub APIs require tenant/outlet scope, actor identity, purpose, correlation ID and idempotency key for each state change.
- Providers update external status only through signed webhook verification or verified pull envelopes. Manual evidence is labelled evidence, never provider truth.
- Money, stock, wallet, loyalty and accounting use append-only facts with controlled reversals. Aggregate/report tables are projections.

## Cloud service composition

| Component | Required responsibility | Phase |
| --- | --- | --- |
| Identity and policy service | Password/passkey/MFA/session revocation, canonical roles/scopes, step-up decisions | 0–2 |
| Retail API | Versioned commands/read models, transaction/outbox and idempotency | 2 |
| PostgreSQL | Canonical cloud facts, immutable event/ledger records, migrations and partitioning/retention | 2 |
| Redis/queue | Durable workers, retry/dead-letter, rate limits and non-authoritative cache | 2 |
| Integration gateway | Bakaloo source adapter, payments, messaging, maps, delivery, ONDC/marketplaces and GST provider envelopes | 2–4 |
| Analytics projection | Scope-filtered, freshness-labelled metrics and drill-through | 4–6 |
| Observability | Structured audit trail, logs/metrics/traces, alerting and release health | 2–7 |

The present Retail Hub contracts are retained as the read-only migration nucleus. They must be hosted behind real authentication, persistence, authorization, observability and deployment controls before they are described as a service.

## Cutover invariants

1. Every incoming source record has a source system, external ID, observed time, source revision/checksum, cursor and immutable batch ID.
2. Every command has tenant, outlet, actor, correlation ID, idempotency key, expected version and audit reference.
3. A write cannot be enabled unless the last shadow batch, mapping, variance report, reviewer decision and rollback owner are current.
4. Stock and money conflicts stop the affected cutover scope; they never silently last-write-win.
5. The system shows Demo, Imported or Live workspace state, data freshness and sync health in the operator UI.

## Data retention and resilience

The target Store Edge will maintain an encrypted local operational database, encrypted backups and a tamper-evident local event/outbox trail. The current primary SQLite database is not yet encrypted; its migration and rollback proof are an explicit Phase 0 gate. Hub will maintain encrypted managed storage, verified backups, restore exercises and retention policies approved by the business/privacy owner. Offline operations use a durable queue, deterministic idempotency, user-visible stale/conflict status and a tested recovery path.
