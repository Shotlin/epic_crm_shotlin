# Phase 4 execution — decision intelligence and ecosystem scale

Status: started after the locally verifiable Phase 3 reliability gates.

External provider certification remains a deferred release gate. It does not block the Phase 4 product build, but it does block a production claim for any certified GSP/IRP, banking, payroll, messaging, or logistics connector.

## 4A — Governed decision intelligence

- Create a company-and-branch-scoped semantic metrics layer from canonical ledger, operational, service, and workforce evidence.
- Surface cash, margin, demand, fulfilment, quality, people, and service risks with drill-through evidence instead of opaque scores.
- Add scenario planning for revenue, cash, capacity, and inventory with assumptions, versions, approvals, and audit history.
- Add a decision inbox that converts material thresholds into owned, reviewable operating actions.

## 4B — Ecosystem contracts

- Define versioned public API contracts, scoped API keys, webhooks, signature verification, idempotency, replay protection, and connector-health evidence.
- Add governed import/export packages with field mapping, validation previews, exception queues, and immutable run receipts.
- Keep every integration fail-closed by company, branch, policy scope, and capability approval.

## 4C — Experience and mobility

- Turn intelligence into role-aware home pages for owner, finance, sales, operations, people, and service users.
- Add compact-window and tablet workflows, keyboard-first command paths, accessible states, and real workflow completion tests.
- Keep operational actions close to the evidence that justified them.

## 4D — Launch control

- Add release readiness scorecards, migration and backup drills, performance budgets, support diagnostics, and signed build provenance.
- Re-open the deferred provider-certification gate before any production connector is activated.

## First implementation slice

Phase 4A.1 will establish the governed decision inbox and evidence-linked cross-domain risk signals. It will deliberately use existing canonical snapshots first, so it improves decision speed without inventing a second ledger or an untraceable AI layer.

### 4A.1 delivered — initial decision inbox

The Intelligence workspace now renders evidence-linked priorities for negative cash runway, reviewed negative project margin, GST payable workpapers, and financial-close blockers. Each signal is calculated from existing scoped operational or canonical-ledger snapshots and includes the supporting evidence count or amount; it does not make autonomous financial decisions.

### 4A.2 delivered — accountable evidence handoffs

Every initial decision-inbox signal now has a direct handoff to the responsible workbench: treasury, delivery economics, statutory control, or close readiness. This keeps prioritisation and remediation connected without granting the intelligence surface independent mutation authority.

### 4A.3 delivered — governed cash scenario comparison

The Intelligence workspace now compares the latest base, conservative, and upside cash forecasts already stored in Treasury. It shows opening, projected closing, low point, and the direct path to review each scenario's source assumptions.

### 4A.4 delivered — replayable cash assumption manifests

Every newly generated cash forecast now preserves its collection factor, planned-outflow coverage factor, source-record counts, and a SHA-256 checksum over the immutable assumptions and forecast lines. Treasury surfaces whether the active run is evidence-sealed; legacy runs remain readable but are clearly identified as unsealed.

### 4B.1 delivered — signed webhook envelope boundary

The ecosystem boundary now defines a versioned signed webhook envelope and a verifier that rejects missing fields, altered payloads, duplicate idempotency keys, invalid signatures, and deliveries outside a bounded replay window. Connector-specific HTTP endpoints are deliberately not exposed until an approved integration contract is assigned a company, branch, capability, and secret owner.

### 4B.2 delivered — scoped API-key administration

The public-integration foundation now issues one-time API tokens while retaining only a SHA-256 token hash, key prefix, company and branch boundary, explicit scopes, creation time, and revocation state. Verification is timing-safe and fails closed for revoked keys, wrong company/branch, or missing scopes. SQLite migration 008 persists the administration record, and the authenticated IPC bridge exposes exact-scope list/issue/revoke operations.

### 4B.3 delivered - public API authorization boundary

The public API boundary now provides a reusable Bearer-token authorizer with an explicit resource-to-scope map for CRM, sales, finance, inventory, service, and webhook traffic. It validates the token using the timing-safe API-key verifier and enforces the key's company and branch boundary before a route handler can execute. Endpoint handlers can therefore share one fail-closed contract rather than reimplementing scope checks independently.

### 4B.4 delivered - governed exchange preview boundary

The ecosystem data-exchange boundary now previews CSV packages using explicit source-to-target mappings, required-field rules, duplicate-key detection, unknown-column exceptions, accepted/rejected row counts, and a deterministic SHA-256 receipt. A preview with exceptions is marked blocked, giving future import commit handlers a clear fail-closed handoff instead of accepting ungoverned data silently.

### 4D.1 delivered - explicit launch readiness gates

Launch control now evaluates named evidence gates for static checks, the complete test suite, production packaging, backup/restore drills, and external provider certification. A gate marked deferred is not treated as successful: the readiness result stays blocked until the evidence is supplied, preserving the distinction between local engineering completion and real-world connector certification.

### 4B.5 delivered - connector-health evidence

Provider health now combines credential state, conformance evidence, outstanding handoffs, and pull-reconciliation exceptions into a per-connector healthy/degraded/blocked result with human-readable reasons. This keeps the provider fabric honest when a connector is configured but still lacks independent certification or external response evidence.

### 4B.6 delivered - governed exchange commit boundary

An exchange preview can now be committed only when it has no exceptions or rejected rows, its SHA-256 receipt still matches the expected checksum, and an accountable actor is present. This prevents a file from changing between review and import and keeps blocked data outside the commit path.

### 4B.7 delivered - scoped API-key administration experience

Control Room now exposes a role-authorized integration lane for listing, issuing, and revoking public API keys within the active company and branch. Operators choose least-privilege scopes, receive the secret only once, and see revocation state without exposing stored hashes. Renderer coverage certifies the issue/list/revoke path through the real bridge rather than a mock-only button.

### 4B.8 delivered — governed API-key inventory export

Control Room can now export a deterministic, company-and-branch-scoped API-key inventory through the authenticated bridge. The CSV excludes secret hashes, sorts records deterministically, and returns a SHA-256 receipt so an operator can prove exactly which metadata package was exported.

### 4D.4 delivered - provider certification handoff contract

The deferred provider gate now has a structured evidence contract for each GSP/IRP, banking, payroll, messaging, and logistics provider. It requires contract identity, sandbox evidence, credential ownership, test-case references, an independent approver, and production approval evidence before production readiness can be declared.

### 4D.12 delivered — redacted provider certification package

The provider handoff contract now produces a deterministic, checksum-addressed package containing only provider identity, contract and sandbox references, test-case references, readiness classification, and accountable ownership. Credential material and signed payloads are never included; the package cannot mark a provider certified without the real evidence.

### 4D.13 delivered — Control Room provider-template export

Control Room now exposes an authenticated provider-template export action. It writes the redacted package through the Electron save dialog and reports its checksum and readiness classification; an empty template is intentionally reported as evidence-required rather than certified.

### 4C.1 delivered - role-aware initial workspace

The Electron shell now derives a user's starting workspace from effective role grants rather than always opening the same module. Finance, operations, people, service, sales, CRM, and intelligence responsibilities each have explicit priority mappings, with a safe CRM fallback for unknown or unscoped users.

### 4C.2 delivered - keyboard-first major-workspace routing

The shell now supports Alt+1 through Alt+8 routing for Command, CRM, Sales, Finance, Operations, People, Service, and Intelligence. The shortcuts close the compact/mobile navigation gap without stealing ordinary input focus, and renderer certification covers the real destination changes.

### 4C.3 delivered - discoverable accessibility shortcuts

Primary navigation now advertises each Alt-number shortcut through `aria-keyshortcuts` and its tooltip, so keyboard routing is discoverable to assistive technology and pointer users alike.

### 4C.4 delivered - skip-navigation accessibility path

The shell now exposes a visible-on-focus “Skip to workspace” link targeting the focusable active canvas, allowing keyboard and assistive-technology users to bypass the full navigation rail in one action.

### 4D.2 delivered - persisted release evidence ledger

Release-gate evidence now has a SQLite-backed administration record (migration 009), authenticated read/record IPC routes, and a Control Room ledger. The UI makes passed, failed, and deferred gates visible and keeps production blocked while any gate—including external provider certification—remains unresolved.

### 4D.3 delivered - canonical readiness evaluation

Readiness is now evaluated in the main process from the persisted gate ledger and exposed through a read-authorized bridge route. All six required gates must exist and pass; missing evidence is treated as deferred, preventing a partial ledger from ever being interpreted as production-ready.

### 4D.5 delivered - explicit missing-gate evidence

The readiness contract now returns the exact required gate IDs that have not yet been recorded. Control Room renders those missing gates beside the deferred count, making an incomplete release packet actionable instead of leaving operators to infer gaps from an empty ledger.

### 4D.6 delivered - deterministic readiness review packet

The main process can now generate a canonical, SHA-256-addressed readiness packet containing sorted gate evidence, missing-gate IDs, status counts, and the generation timestamp. Control Room exposes this as a reviewed action so release evidence can leave the application without relying on screenshots or manually reconstructed summaries.

### 4D.7 delivered - build provenance identity

The trusted system bridge now exposes a checksum-addressed build identity containing product version, platform, build revision, schema revision, and generation time. Control Room displays that identity beside the release ledger, allowing a readiness packet to be tied to the exact Electron artifact under review.

### 4D.8 delivered - artifact-bound readiness packets

Every readiness packet now carries the build-provenance SHA-256 that produced it. A reviewer can therefore reject a packet generated by a different artifact, even when its gate rows look identical.

### 4D.9 delivered - redacted support diagnostics

Control Room can now generate a checksum-addressed support packet containing operational health, release readiness, missing gates, and build provenance. The packet uses an explicit redaction version and excludes credential material, making incident handoff reproducible without leaking secrets.

### 4D.10 delivered - explicit performance-budget evaluator

Performance evidence now has a typed evaluator for cold startup, scoped IPC reads, renderer interactions, and backup operations. It validates measurement integrity, classifies over-budget paths, and preserves the evidence reference; it deliberately does not fabricate production timings when no measurement has been supplied.

### 4D.11 delivered - canonical and fail-closed release evidence

Release readiness now canonicalizes one latest evidence row per required gate, ignores unknown gate IDs, and blocks malformed latest evidence instead of allowing duplicate or invalid rows to distort readiness counts. The invalid gate IDs are included in deterministic review packets, support diagnostics, and the Control Room warning surface.
