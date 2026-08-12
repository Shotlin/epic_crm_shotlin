# Epic BOS Retail Hub — read-only foundation

This folder is an isolated foundation for the future Epic BOS Retail Hub. It
does **not** start a server, connect to Bakaloo, read credentials, call a live
API, persist an import, or write to Epic BOS.

The first migration stage is intentionally shadow-only: a separately obtained
source export is converted into review evidence, then served through a small
read-only HTTP contract. This keeps a live Bakaloo installation untouched
until a later, approved connector and reconciliation cutover exist.

## Public contract

`buildShadowImportPlan(evidence)` verifies a supplied SHA-256 checksum and
returns all review artifacts together:

- `ImportBatch` — source, mode, checksum status, and blocked/ready state.
- `ExternalIdMap` — explicit source-to-Epic-BOS identities; missing maps
  become open conflicts and never create a record.
- `ImportCursor` — source checkpoint and observation time.
- `ShadowImportConflict` — checksum, duplicate identity, missing map, and
  count-variance evidence.
- `ReconciliationReport` — declared versus observed record totals.

`createRetailHubService({ shadowImportPlans })` exposes the result through a
portable HTTP-facing `handle({ method, url })` function. It provides:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Reports read-only mode plus server-owned source status; unconfigured deployments never claim reachability. |
| `GET` | `/v1/shadow-imports/batches` | Lists import-batch evidence. |
| `GET` | `/v1/shadow-imports/batches/:batchId` | Reads one batch. |
| `GET` | `/v1/shadow-imports/external-id-maps` | Reads mappings; filters: `batchId`, `entity`. |
| `GET` | `/v1/shadow-imports/cursors` | Reads source cursors; filter: `batchId`. |
| `GET` | `/v1/shadow-imports/conflicts` | Reads open conflicts; filter: `batchId`. |
| `GET` | `/v1/shadow-imports/reconciliation` | Reads reconciliation reports; filter: `batchId`. |
| `GET` | `/v1/shadow-imports/preflight` | Evaluates one batch for shadow-review readiness; requires `batchId` and server-owned deployment/credential configuration. |
| `GET` | `/v1/shadow-imports/review-decisions` | Reads actor-bound review evidence; filter: `batchId`. |
| `GET` | `/v1/shadow-imports/cutover` | Assesses one capability for a controlled parallel run; query: `batchId`, `capability`. |
| `GET` | `/v1/shadow-imports/source-status` | Reads non-secret source connectivity and credential-generation status from the server-owned connector. |
| `GET` | `/v1/shadow-imports/pull-receipts` | Reads immutable pull audit receipts; filter: `batchId`. |
| `POST` | `/v1/shadow-imports/review-decisions` | Records an internal accepted/rejected review decision; requires `shadow-import:review`. |
| `POST` | `/v1/store-edge/sync` | Accepts one checksum-bound Store Edge event into an injected sync inbox; requires `store-edge:sync`. |
| `GET` | `/v1/store-edge/sync/receipts` | Reads scope-bound Store Edge receipt evidence; requires `store-edge:sync`. |
| `GET` | `/v1/store-edge/worker/metrics` | Reads an injected, scope-bound worker metrics projection; requires `store-edge:observe`. |
| `GET` | `/v1/store-edge/worker/dead-letters` | Reads scope-bound dead-letter work evidence; requires `store-edge:recover`. |
| `POST` | `/v1/store-edge/worker/dead-letters/requeue` | Requeues one dead letter with an operator reason and evidence reference; requires `store-edge:recover`. |
| `POST` | `/v1/channel-orders/events` | Accepts one normalized INR channel-order event in `shadow` or `governed` mode; requires `channel-orders:ingest`. |
| `GET` | `/v1/channel-orders/receipts` | Reads scope-bound channel-order receipt/conflict evidence; requires `channel-orders:read` or `channel-orders:ingest`. |
| `GET` | `/v1/deployment/preflight` | Reads server-owned deployment readiness without returning configuration values. |

`POST`, `PUT`, `PATCH`, and `DELETE` remain rejected with `405` except for the
explicit review-decision, Store Edge, dead-letter recovery, and channel-order evidence routes. Those routes record
bounded review/synchronization evidence only; they cannot mutate Bakaloo, Epic
BOS business records, inventory, orders, or payments. Store Edge events are
idempotent by scoped event ID and checksum, while transaction-key drift and
stale sequence numbers become explicit conflicts. `registerReadOnlyRetailHubRoutes()` is
a structural Fastify-compatible adapter; Fastify is not installed yet, so this
foundation adds no runtime dependency or background process.

Channel-order events are normalized to INR and carry a stable source digest and
identity key across POS, website, app, WhatsApp, ONDC, and marketplace
connections. The Node adapter requires the trusted authorization scope to
match the resolved tenant/company/branch scope; checksum drift and invalid
status transitions become conflict receipts, while same-event retries are
idempotent. `writeBackAllowed: false` is returned on both acceptance and
receipt responses. `createPostgresRetailHubChannelOrderTransport` now provides
the durable alternative to the in-memory store. It requires the same
transaction-scoped RLS SQL client used by the other Hub repositories, persists
records and receipts in `retail_channel_order_records` and
`retail_channel_order_receipts`, and never accepts an unscoped query. Apply
`retailHubChannelOrderPostgresSchema` as an approved Hub migration before
enabling it. A provider connector, approved SKU map, local
sales-order/reservation handoff, settlement reconciliation, and parallel-run
evidence are still required before a governed cutover.

The service now accepts an explicit `ShadowImportRegistry` seam as well. The
default in-memory registry clones every plan, rejects blank identities, and
keeps replacement internal to the importer; HTTP callers still cannot mutate
it. A PostgreSQL adapter can implement that same seam later, after migration
retention, tenant isolation, and rollback ownership are approved.

The Hub also accepts a strict versioned `epic-bos-shadow-import` JSON export
through `parseShadowImportEvidenceJson` and
`ingestShadowImportEvidenceJson`. The boundary accepts only Bakaloo evidence,
rejects credential-like keys, builds the checksummed `shadow-read-only` plan,
and registers it through the repository seam. It performs no filesystem or
network I/O and never writes back to Bakaloo.

`collectShadowImportEvidence` is the next server-side adapter seam. An
injected `ShadowImportSourceAdapter` exposes only `pullPage`, so a future
Bakaloo client can keep credentials inside a protected server vault while
returning bounded pages. The collector requires source-declared totals,
rejects repeated or non-advancing cursors, enforces page/record limits, rejects
credential-like payload keys, and emits the same checksum-verified review plan.
It performs no write-back and is not a live connector until an approved
adapter supplies real credentials and evidence.

`createBakalooShadowHttpAdapter` is a GET-only HTTPS transport wrapper for
that seam. It accepts no renderer headers or write method, requires a
credential-free same-origin URL, limits response size, and rejects non-JSON or
non-200 responses. Authentication can only be added by the injected
server-owned requester; this repository still contains no live credentials.

The durable Hub can optionally expose a server-resolved source status through
`/v1/shadow-imports/source-status` and `/health`. The status is deliberately
non-secret (`unconfigured`, `configured`, `reachable`, or `unreachable`) and
may include only a credential generation, timestamp, and bounded message. The
renderer cannot claim that a source is reachable, and the default remains
`unconfigured`.

`createBakalooShadowHttpAdapterFromVault` is the credential handoff seam for a
real deployment. It accepts only a non-secret vault reference and trusted
tenant/company/branch scope; the vault resolves headers inside the Hub process,
the transport injects them only for GET requests, and every page is bound to
the same vault revision. Missing material, malformed headers, or rotation
between the revision check and request abort the pull before evidence is
accepted. No secret, header, or vault reference is placed in the shadow plan.

`pullAndRegisterBakalooShadowImportFromVault` is the durable orchestration
entry point. It checks for an existing scoped batch before resolving any
credential, then composes the vault adapter with immutable PostgreSQL
registration. This keeps duplicate pulls, secret resolution, source reads,
and persistence in one auditable server-owned sequence.

When configured, the HTTP adapter also binds a non-secret credential revision
to every snapshot and can re-check the authoritative vault generation before
each page. A rotation aborts the pull, and the resulting batch/evidence keeps
the revision for later audit and replay decisions.

`createPostgresShadowImportRepository` is the durable persistence seam for the
next deployment stage. It requires an injected SQL client, scopes every read
and upsert by tenant, company, and branch, clones stored JSON, and uses the
provided migration text with a scoped primary key and row-level-security hook.
The adapter does not open a connection or run migrations by itself.

The migration text now enables and **forces** row-level security on all three
shadow tables. Each table has a policy bound to transaction-local
`epic_bos.tenant_id`, `epic_bos.company_id`, and `epic_bos.branch_id` settings;
missing settings match no rows. Trusted Hub middleware must set these values
inside a transaction after authorization. Renderer-supplied scope is never a
substitute for these database settings.

`ShadowImportSqlClient.withScope` is the required transaction wrapper for every
durable repository operation. `createRlsScopedSqlClient` issues parameterized
`set_config(..., true)` calls and verifies `current_setting(..., true)` for all
three dimensions before repository SQL runs, keeping RLS settings
transaction-local. Missing the wrapper or a scope mismatch fails closed; local
contract tests may use in-memory stores, but a production adapter must provide
the trusted wrapper and run the live RLS migration drill.

`createPostgresRetailHubService` binds that repository to the read-only HTTP
resource vocabulary asynchronously. A trusted server-side scope resolver is
required; missing scope returns `403`, renderer-supplied scope is not trusted,
and all write verbs remain `405`. Deployments may additionally provide a
trusted authorization resolver; when present, the actor must hold the
`shadow-import:read` permission and the resolver's tenant/company/branch scope
is authoritative. Missing authorization or permission returns `403` before the
repository is touched. This is the runtime seam for a future
Fastify/PostgreSQL deployment, not a claim that credentials, pooling, or live
Bakaloo connectivity are configured.

Review evidence is append-only within a legal scope, and the persistence
migration enforces one accepted decision per shadow-import batch. Repeated
acceptance attempts therefore cannot silently create competing cutover
evidence; rejected decisions remain an auditable trail until a later approved
batch is produced.

Acceptance is also bound to the source credential generation when a snapshot
was collected with a versioned credential. The trusted service resolves the
current generation at review time; a missing or mismatched generation rejects
acceptance and requires a fresh shadow pull. This prevents an approval from
remaining valid after a Bakaloo secret has been rotated or revoked. Rejected
review decisions remain available as audit evidence, but they never authorize
write-back.

Historical accepted decisions are projected as `active`, `stale`, or
`unverified` when read. A rotated generation therefore preserves the audit
record while removing any ambiguity that it is still valid for cutover.

The Electron device boundary now exposes a main-process-only native driver
result contract for USB and Bluetooth peripherals. A future signed bridge
must return the approved driver code/version, response protocol, reference,
checksum, and bounded byte length; raw device bytes are never persisted.
Driver identity is checked against the exact approved profile revision, and a
driver-reported `unsupported` result is retained as an explicit failed
transport with `nativeDriverStatus=unsupported`. This is an integration seam,
not a claim that native USB/Bluetooth drivers or hardware certification are
installed in this build.

`pullAndRegisterShadowImport` is the server-owned orchestration seam for a
future credentialed Bakaloo pull. It runs the bounded `GET`-only adapter,
registers the checksummed plan only after the complete snapshot succeeds, and
refuses to overwrite an existing batch. It is an internal Hub function, not a
renderer route, and it performs no write-back to Bakaloo or Epic BOS business
records.

The PostgreSQL repository exposes the same distinction: `registerPlan` uses a
scoped `INSERT ... ON CONFLICT DO NOTHING RETURNING` and fails on a duplicate,
while `replacePlan` remains an explicitly internal migration/file-ingestion
seam. Durable deployments therefore cannot silently overwrite reviewed source
evidence during a pull.

`pullAndRegisterScopedShadowImport` composes that read path with the scoped
PostgreSQL repository. It resolves trusted tenant/company/branch scope, checks
duplicates before and after collection, and requires durable immutable
registration before writing evidence. The durable repository must provide a
single atomic plan-and-receipt registration operation; a non-atomic fallback is
rejected so a failed receipt write cannot leave half-registered migration
evidence. It is an internal server seam; no renderer-controlled scope or
credential is accepted.

Successful pulls now also produce an immutable `ShadowImportPullReceipt` with
the trusted scope, observed/registered times, credential generation, page and
record counts, and plan checksum. PostgreSQL deployments can persist these
receipts in `retail_shadow_import_pull_receipts`; the receipt never authorizes
write-back and contains no secret material.

`assessShadowImportCutover` adds the capability-level parallel-run gate for
catalog, inventory, customers, orders, delivery, settlements, campaigns, and
storefront content. It requires reconciled entity evidence, complete identity
maps, a matching scoped approval, and the current credential generation. A
ready result only authorizes comparison during a controlled parallel run;
`writeBackAllowed` remains false.

The durable service exposes this as the authenticated read-only route
`GET /v1/shadow-imports/cutover?batchId=...&capability=...`. It returns the
same assessment against the trusted scope and current credential generation;
the route has no POST/PUT/PATCH/DELETE variant.

`createNodeHttpRetailHubServer` is a dependency-free Node HTTP adapter around
the durable service. It does not listen automatically, open a database, read
credentials, or infer scope from request headers. Without an injected trusted
context resolver, protected requests return `403`; review bodies are bounded
JSON and malformed or oversized payloads are rejected before service dispatch.
This is a local contract/deployment seam, not a production Fastify,
PostgreSQL, Redis, TLS, or live Bakaloo deployment.

`startRetailHubProductionServer` is the corresponding fail-closed process
boundary. A host supplies the already-wired durable service, trusted context
resolver, and infrastructure seams; the function generates the value-free
deployment preflight and refuses to bind a listener while any production check
is on hold. Binding requires an explicit host and port (wildcards and missing
ports are rejected), and a failed listener is closed before the error escapes.
This makes startup auditable without pretending that a local process has a
database, provider credentials, TLS termination, or a live Bakaloo connector.

The Store Edge inbox is the offline-coordination seam. It validates a bounded,
checksum-bound event payload, rejects secret-like fields, binds the receipt to
trusted tenant/company/branch scope, and exposes idempotent or conflicted
outcomes. Durable PostgreSQL inbox and worker repositories now fail closed
without the transaction-scoped client, reclaim expired leases, and return the
authoritative post-conflict work row, and renew active leases with a fencing
token while long-running processors execute. The in-memory inbox is deliberately
disposable; a production deployment still needs an authenticated outbox relay,
real retry/heartbeat infrastructure,
and backup/recovery evidence before any Store Edge event can affect live
business state.

The Node adapter can expose `/v1/store-edge/worker/metrics` only through an
injected scope-bound metrics provider. It never exposes process-global worker
totals or trusts renderer scope; absent provider/configuration returns `503`,
and missing observer permission returns `403`. This is an observation seam,
not a claim that a worker or metrics backend is deployed.

`createStoreEdgeSyncWorkerRuntime` accepts an optional
`StoreEdgeSyncWorkerMetricsStore`; its async `loadMetrics(scope)` method reads
the durable projection before any worker run. The runtime loads and saves counters by
tenant/company/branch, so a process restart cannot erase queue history and a
shared worker cannot merge branch totals. `createPostgresStoreEdgeSyncWorkerMetricsRepository`
persists that projection in `retail_store_edge_sync_worker_metrics` through the
same transaction-scoped RLS client; malformed rows and unscoped clients fail
closed. The deployment metrics flag therefore requires this durable projection
and its observability export, not only an in-memory counter.

`evaluateRetailHubDeploymentReadiness` and
`assertRetailHubDeploymentReady` provide the next release-control boundary.
They validate explicit origins, trusted authentication, TLS, PostgreSQL,
Redis, credential-vault, observability, backup, and shadow/parallel-run mode
without opening a connection or exposing configuration values. A
`write-enabled` source mode always remains on hold; write-back requires the
separate scoped cutover decision and evidence.
The production check also requires `databaseRlsContextConfigured`, which is
the deployment's proof that `ShadowImportSqlClient.withScope` is wired to a
transaction-local tenant/company/branch context.

`readRetailHubDeploymentConfig` is the narrow server-side environment boundary
for that check. It accepts only the documented `RETAIL_HUB_*`, `DATABASE_URL`,
and `REDIS_URL` values, treats missing or malformed booleans/enums as invalid,
and returns invalid key names separately so deployment tooling can fail closed
without printing secrets. The caller still owns secret storage and must keep
the resulting configuration server-side.

`createRetailHubDeploymentPreflight` converts that boundary into a safe,
machine-readable CI/control-room artifact. It returns only the environment
name, check results, invalid key names, blockers, timestamp and the immutable
`writeBackAllowed: false` flag; it never serializes a database URL, Redis URL,
credential, header, or provider response.

The deployment gate also requires four explicit Store Edge operations flags:
`RETAIL_HUB_STORE_EDGE_WORKER_CONFIGURED`,
`RETAIL_HUB_STORE_EDGE_ATOMIC_INBOX_CONFIGURED`,
`RETAIL_HUB_STORE_EDGE_METRICS_CONFIGURED`, and
`RETAIL_HUB_STORE_EDGE_RECOVERY_CONFIGURED`. These prove that the
lease/retry/heartbeat/dead-letter worker is actually deployed,
event/receipt/work-item writes use the
atomic inbox/outbox boundary, queue health is exported, and a backup/restore
plus conflict-recovery drill has been recorded. Source code and an in-memory
worker are not accepted as production evidence; missing flags keep staging and
production on hold.

## Verification

From this directory, use the existing Epic BOS toolchain:

```powershell
pnpm run verify
```

This runs TypeScript checking and the current public-contract test suite (26
files / 123 tests). No dependency
installation was needed for this foundation.

## Next approved boundary

A future connector may acquire Bakaloo sandbox credentials and produce the
`ShadowImportEvidence` input only after the owner has approved scopes, data
mapping, retention, reconciliation thresholds, rollback, and audit storage.
It must remain read-only until a separate cutover decision explicitly enables
an audited write path.
