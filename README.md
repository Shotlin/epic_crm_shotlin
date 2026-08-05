# Epic BOS

Epic BOS is an Electron-first business operating system: one secure desktop workspace for CRM, finance, sales, procurement, inventory, manufacturing, HR, projects, service, analytics, automation, and integrations.

## Execution status — 2026-07-16

Phase 0, the Phase 1 business kernel, and a substantial Phase 2 CRM baseline are executable, tested, and packaged. This is a working product, not a set of planning-only Markdown files; it is not yet the complete ERP/CRM vision.

### What works now

- Secure Electron shell with Chromium sandboxing, context isolation, CSP, denied permissions, blocked popups/navigation, ASAR integrity, and locked production fuses.
- First-run owner enrollment with no default password; salted memory-hard password derivation, constant-time verification, lockout, eight-hour revocable sessions, lock/logout, and forced temporary-password rotation.
- Company, branch, user, role, grant, field-access, segregation-of-duties, approval-policy, fiscal-period, document-numbering, custom-field, audit, and outbox controls.
- Transactional SQLite persistence in WAL mode with checksum-locked migrations, defensive mode, prepared statements, and legacy JSON import.
- AES-256-GCM attachment vault with an OS-protected master key, per-file nonces, authenticated metadata, SHA-256 integrity, and verified export.
- Interactive online database backup plus checksum, SQLite integrity, schema validation, pre-restore safety copy, staged replacement, and verified restart.
- CRM revenue command center with pipeline, weighted forecast, win rate, cycle time, activities, lead capture, legal stage transitions, and optimistic concurrency.
- Phase 2 party master with accounts, contacts, addresses, typed contact points, relationships, consent provenance, marketability, duplicate detection, and version-safe golden-record merge execution.
- Idempotent lead-to-party conversion, configurable pipeline policies and transition graphs, scoring rules, lead grades, category forecasting, consent-governed campaigns, and shared saved views.
- Governed lead imports with quoted-CSV parsing, row validation, deduplication, exception quarantine, preview, and explicit commit.
- Provider-neutral email/calendar adapter boundaries plus a unified, persisted communication timeline; live OAuth/sync remains an isolated future adapter responsibility.
- India-first revenue operations with GST state-code territories, deterministic assignment, reusable segments, campaign lifecycle, INR pursuits, account detail lens, product/HSN-SAC interests, controlled bulk actions, and commercial GST quotation previews.
- Bharat Revenue Grid: a dedicated Electron workspace for India business identity, market topology, pursuit routing, quotations, and territory intelligence.
- Commercial Foundry: effective-dated GST/HSN-SAC masters, product catalog, INR price books, price tiers, controlled discounts, maker-checker quotation approval, native PDF export, approved quote-to-order conversion, and fulfilment task orchestration.
- Revenue Ledger: delivery and acceptance evidence, service milestone billing, payment terms, controlled tax invoices, credit/debit notes, receivables, allocated and unapplied cash, bank reconciliation, balanced accounting handoffs, and native invoice PDF receipts.
- Canonical General Ledger foundation: an explicit India legal-entity and branch binding (INR, April fiscal year), India-first chart of accounts, governed open fiscal periods, sequenced balanced manual journals, independent maker/checker posting, hash-linked immutable posted evidence, cancellable draft reversals, a live trial balance, and the first replay-safe Revenue Ledger invoice-to-GL draft bridge with checksum, tax-evidence, source-identity, duplicate-export and maker/checker controls.
- Fulfilment Control Tower: multi-GSTIN/place-of-supply review, stock locations and reservation ledger, shipment packages, package invoicing, carrier-neutral custody events, IRP/e-way acknowledgement reconciliation, dispatch gating, delivery and independently authorised returns.
- Warehouse Atlas: variants, item-specific UOM conversion, facility zones and bins, batches/serials/expiry, receipts and cost layers, directed putaway/picking, transfers, cycle counts, reorder policies, and independent NRV review across FIFO, moving-average, and specific-identification boundaries.
- Statutory Mission Control: cancellation, closure, E-way validity extension, consolidated movement manifests, local digital-signature evidence, AES-GCM-vaulted GSP/IRP credentials, and a cross-domain Provider Fabric for banking, payroll, and statutory-pack conformance, handoff, and pull-based truth reconciliation.
- India Collections Command: credit exposure, aging and dunning, disputes, controlled write-offs, transition-aware TDS/TCS, export/SEZ zero-rating evidence, and independently confirmed bank-statement matching.
- Procurement Command: maker-checker purchase requisitions that source RFQs, supplier qualification, RFQs and bid awards, maker-checker purchase orders, reorder conversion, warehouse-backed goods receipts, landed-cost capitalisation, supplier invoices and three-way matching.
- Treasury Command: evidence-backed multi-bank positions, rolling cash forecasts, three-key supplier-payment release, settlement exceptions, bank charges, and controlled liquidity sweeps with balanced accounting handoffs.
- Manufacturing Command: maker-checker BOM and quality-plan releases, capacity-bounded work orders, material-to-WIP costing, measurable quality inspections, independently resolved nonconformances, and costed finished-goods receipt into controlled inventory.
- Delivery Command: maker-checker project activation, accountable tasks and independently approved time, active-SLA support cases, response/resolution clocks, and technician-only field dispatch with completion evidence.
- Workforce Runway: independently activated employee capacity and internal cost profiles, approved availability exceptions, task-level named-capacity reservations, and field-eligibility gates connected directly to delivery execution.
- Financial Close Folio: independently activated project billing plans, evidence-bound time or milestone claims, balanced revenue-recognition journals, claim-to-invoice unbilled-revenue clearing, service-entitlement consumption, and export-gated close/reopen controls.
- Project Commercial Control: independently reviewed FX evidence and contract-currency baselines, scope/rate/schedule variations, retainer drawdown against approved time, resource-cost planning, and operational margin review—explicitly separated from statutory accounting and FX valuation.
- People Ledger: effective-dated employer registrations, independently reviewed payroll policy sources and pay schedules, reviewable attendance and leave evidence, approved arrear/recovery adjustments, employee tax-declaration evidence, private payslip delivery, frozen monthly payroll runs and slips, maker/checker/releaser separation, balanced payroll and reimbursement journal handoffs, statutory-obligation evidence tracking, receipt-backed expenses, and benefit-plan/enrollment controls.
- Responsive light/dark interface, accessible focus states, reduced-motion support, keyboard command search, governance console, policy editor, approval inbox, storage console, and party registry.

The full product mandate is in [PRODUCT_CHARTER.md](./PRODUCT_CHARTER.md). India compliance boundaries and official references are in [INDIA_LOCALIZATION.md](./INDIA_LOCALIZATION.md). Third-party provenance and license boundaries are governed by [THIRD_PARTY_REUSE.md](./THIRD_PARTY_REUSE.md). Current execution state and the next build wave are in [EXECUTION_STATUS.md](./EXECUTION_STATUS.md).

## Architecture boundary

```text
React renderer (no Node or filesystem access)
        |
        | narrow typed context bridge
        v
Electron preload
        |
        | schema-validated, session-aware IPC commands
        v
Electron main process
        |
        +-- authentication and OS key protection
        +-- pure kernel / CRM / party domain rules
        +-- encrypted attachment vault
        +-- encrypted statutory and provider credential vaults
        +-- bounded GSP/IRP and provider status-pull gateways
        +-- transactional SQLite + migration ledger
```

Business mutations are explicit commands. The main process authenticates the renderer, validates payloads, applies domain invariants, records audit/outbox evidence, and commits accepted state transactionally.

## Run and verify

Requirements: Node.js 20.19+ and pnpm.

```bash
pnpm install
pnpm dev
```

Quality and packaging:

```bash
pnpm verify
pnpm package
```

The packaged Windows application is generated at `out/Epic BOS-win32-x64/epic-bos.exe`.

If that directory is in use by a running desktop build, package safely to a separate output directory instead:

```powershell
$env:EPIC_BOS_OUT_DIR = 'out-workspace-refresh'
pnpm package
```

The left navigation is live: Command, CRM, Sales, Finance, Operations, People, Service and Intelligence each render one focused workspace canvas with only the relevant submodule map and operational workbench. Compact windows retain a workspace drawer, shared workbenches keep their owning context where possible, and genuine cross-domain handoffs explain their destination rather than silently changing the workspace.

The current capability audit, source-repository comparison, licensing boundary, and build sequence are in [ARCHITECTURE_PARITY_LEDGER.md](./ARCHITECTURE_PARITY_LEDGER.md). The honest completion scorecard and sequenced executive plan are in [EXECUTIVE_DELIVERY_PLAN.md](./EXECUTIVE_DELIVERY_PLAN.md). Epic BOS now enforces its first owner-safe authorization perimeter for privileged kernel/storage paths and sensitive operational slices. The Finance workspace contains a controlled manual General Ledger foundation and its first governed revenue-invoice source bridge, but credit notes, cash, procurement, payroll, treasury, and inventory journals remain handoffs until their own source-to-GL adapters are delivered. It is not yet a complete financial suite or a production-ready multi-user platform; those P0 foundations are tracked explicitly rather than being implied by menu breadth.

## Roadmap

### Phase 1 — Business kernel (complete baseline)

Identity, organization, authorization, segregation of duties, workflow, approvals, audit, numbering, currencies, fiscal context, extension fields, encrypted attachments, migrations, production persistence, and backup/restore.

### Phase 2 — Party master and CRM depth (advanced baseline)

Unified parties, conversion, merge execution, configurable pipelines, scoring, forecasting, campaigns, saved views, governed imports, communication boundaries, India territories, assignment, segmentation, INR pursuits, product interests, effective commercial catalogs, quote approval, PDF rendering, sales-order conversion, stock allocation, packages, dispatch, returns, statutory acknowledgement, invoice issue, receivables, cash application, and accounting handoffs are implemented. Remaining closeout centers on live provider adapters and deeper automation.

### Finance kernel — controlled foundation (in progress)

India-specific canonical books can now be bound deliberately and used for balanced manual journals, independent posting, immutable hash-chain evidence, reversals, and trial-balance review. Issued Revenue Ledger invoices can now prepare exactly one checksum-verified canonical draft; the next finance work expands that governed adapter family to credit notes, cash, procurement, treasury, inventory, payroll and close, then adds period-close controls, dimensions, financial statements, and statutory return workpapers.

### Later domain waves

Sales and subscriptions; provider-specific certification/accreditation packs; BI/AI; ecosystem integrations.

## Product principle

Epic BOS becomes powerful because every module shares one coherent kernel—not because it accumulates disconnected features. Each wave must remain executable, testable, migratable, observable, and packageable before the next domain expands.
