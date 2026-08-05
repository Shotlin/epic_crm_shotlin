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
| `GET` | `/v1/shadow-imports/review-decisions` | Reads actor-bound review evidence; filter: `batchId`. |
| `GET` | `/v1/shadow-imports/cutover` | Assesses one capability for a controlled parallel run; query: `batchId`, `capability`. |
| `GET` | `/v1/shadow-imports/source-status` | Reads non-secret source connectivity and credential-generation status from the server-owned connector. |
| `GET` | `/v1/shadow-imports/pull-receipts` | Reads immutable pull audit receipts; filter: `batchId`. |
| `POST` | `/v1/shadow-imports/review-decisions` | Records an internal accepted/rejected review decision; requires `shadow-import:review`. |

`POST`, `PUT`, `PATCH`, and `DELETE` remain rejected with `405` except for the
explicit review-decision route. That route records review evidence only; it
cannot mutate Bakaloo, Epic BOS business records, inventory, orders, or
payments. `registerReadOnlyRetailHubRoutes()` is
a structural Fastify-compatible adapter; Fastify is not installed yet, so this
foundation adds no runtime dependency or background process.

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
registration before writing evidence. It is an internal server seam; no
renderer-controlled scope or credential is accepted.

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

## Verification

From this directory, use the existing Epic BOS toolchain:

```powershell
pnpm run verify
```

This runs TypeScript checking and the six public-contract tests. No dependency
installation was needed for this foundation.

## Next approved boundary

A future connector may acquire Bakaloo sandbox credentials and produce the
`ShadowImportEvidence` input only after the owner has approved scopes, data
mapping, retention, reconciliation thresholds, rollback, and audit storage.
It must remain read-only until a separate cutover decision explicitly enables
an audited write path.
