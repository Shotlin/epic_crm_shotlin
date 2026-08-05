# EPIC Business OS — Architecture Parity Ledger

**Status:** active product-control document  
**Last reviewed:** 2026-07-17  
**North star:** an India-first, evidence-first business operating system that is more trustworthy and easier to operate than a collection of ERP modules.

This ledger converts the requested comparison with [Aureus ERP](https://github.com/aureuserp/aureuserp), [ERPNext](https://github.com/frappe/erpnext), and [Odoo](https://github.com/odoo/odoo) into a build sequence. It is deliberately not a claim of parity: a feature is only **Ready** when its critical workflow, permissions, persistence, user experience, and acceptance tests are in place.

## Product position today

EPIC already has meaningful depth in the business kernel, customer/party data, CRM controls, quotations and order handoff, warehouse controls, procurement, manufacturing, delivery, workforce/payroll flows, collections/treasury, and India statutory adapter boundaries. Its differentiator is not a longer menu; it is evidence-first execution: audit history, maker-checker controls, encrypted attachment and credential storage, approvals, and a deliberate boundary around government portals. The normal SQLite business database is not yet encrypted at rest, which remains a production-readiness gap.

The audit found three release-blocking truths:

1. **The workspace shell was presenting one long page rather than true module pages.** Selecting a module could change a heading yet leave unrelated CRM, finance, and governance surfaces mounted together. The shell now isolates each workspace, retains compact-window navigation, and makes unavoidable cross-domain handoffs explicit.
2. **The canonical General Ledger is a controlled foundation, not yet the complete financial book of record.** An explicitly bound India legal entity and branch now receive a company-scoped chart, balanced manual drafts, independent posting, immutable hash-linked journals, separate reversals, and trial balance. Phase 2B completes a bounded core adapter family for issued revenue invoices, reconciled cash, credit/debit adjustments, matched supplier invoices, and approved project recognition; Phase 2C.2 adds a posted-AP-gated procurement capitalisation transfer into fixed-asset cost; Phase 2C.3 adds policy-governed monthly depreciation from posted capitalisations; Phase 2C.4 adds no-proceeds loss-bearing retirement after the cost and depreciation chain is independently revalidated; Phase 2C.5 adds a reversal-aware fixed-asset roll-forward that separately exposes unlinked manual control-account movement; Phase 2C.6 adds an explicitly non-financial, within-branch custody chain with independent release and destination receipt; and Phase 2C.7 adds an explicitly non-financial physical component passport. Each is checksum-verified, replay-safe, and excluded from duplicate legacy export. Component cost allocation, landed cost, treasury, payroll, inventory/manufacturing, dimensions, statements, consolidation, remaining fixed-asset lifecycle, and statutory close remain priority foundation work.
3. **Permission policy needs enforcement at every IPC boundary.** A versioned owner-safe migration and the first privileged/sensitive IPC perimeter are now in place, but defining RBAC and segregation-of-duties rules is not sufficient: every remaining read and write must consult them, be record-scoped, and redact fields before more breadth is added.

## Capability ledger

| Product family | Current EPIC position | Required parity / differentiated scope | Priority |
| --- | --- | --- | --- |
| Kernel, tenancy and control | Strong local kernel: companies, branches, RBAC model, audit, workflows, approvals, attachments, migrations, backup/restore | Enforced field/resource authorization, MFA/passkeys/SSO, session/device management, sync/outbox, tenant service, SCIM, observability | P0 |
| Experience foundation | Workspace rail, command palette, contextual actions, module workbenches | True routed workspace isolation, accessibility/responsive testing, empty/error/loading states, module readiness labels, full button-flow coverage | P0 |
| Accounting and close | Explicit India company/branch binding; seeded company COA; open fiscal periods; balanced manual journals; maker/checker post; immutable hash chain; reversals; trial balance; canonical invoice, cash-receipt, commercial-adjustment, supplier-invoice, project-recognition, asset-capitalisation, depreciation, and no-proceeds-retirement bridges; canonical-posted close completion | Landed-cost, treasury/bank, inventory/manufacturing, payroll/expense, write-off/withholding adapters; AR/AP subledgers, cost centres/dimensions, budgets, period locks, P&L/BS/cash flow, FX revaluation, consolidation, remaining fixed-asset lifecycle | P0 |
| India compliance | GST/HSN, e-invoice/e-way lifecycle, GSP/IRP adapter boundary, TDS/TCS controls | GSTR-1 workpapers, GSTR-2B retrieval/matching, GSTR-3B, ITC exception handling, GSTIN verification, challans, return calendar and filing evidence | P0 |
| CRM and party | Strong party master, consent, dedupe/merge, scoring, campaigns, controlled pipelines/imports | Email/calendar/WhatsApp/telephony packs, web capture, sequences, sales teams/quotas, partner/reseller, commissions, quote options/signature/payment | P1 |
| Sales and commerce | Products, pricing, discounts, quotes, orders, fulfilment handoff | POS/cash shifts/returns, barcode retail, UPI/payment adapters, loyalty/gift cards, subscriptions, rentals, B2B/B2C portal and marketplace channels | P1 |
| Procurement and warehouse | Suppliers, RFQ/PO/GRN, three-way match; UOM, bins, batches, serials, expiry, counts, replenishment | Requisitions, blanket PO/call-off/tenders, supplier scorecards/catalogue/portal, GS1/RF scanning, cross-dock/consignment/dropship, wave/cluster picking | P1 |
| Manufacturing and quality | BOM, routing, work centres, work orders, material issue, inspection/nonconformance | MRP/MPS, finite scheduling, multilevel/subcontracting/by-products, shop-floor scan, OEE, PLM/ECO, calibration, CAPA/QMS, repairs | P1 |
| Assets and maintenance | Phase 2C.11: scoped installed-asset passports and preventive maintenance; maker/checker procurement capitalisation; effective-dated residual-aware monthly depreciation; independently approved no-proceeds retirement; reversal-aware GL roll-forward; custody and inter-company transfer accounting; physical component passports/allocation; sale disposal with GST/gain evidence; impairment/revaluation; warranties/AMC; meters/corrective maintenance; calibration; spares; fleet; and installed-base history; scoped read projection and governed lifecycle IPC | Canonical close/reversal hardening, provider certification, mobile-quality UX, service analytics and full finance-close integration | P1 |
| People lifecycle | Workforce/payroll and controlled people evidence are present | Verify/rebuild recruitment, employee/org master, onboarding/offboarding, attendance kiosk/overtime, planning, appraisals/OKR/360, skills/certifications, HR records | P1 |
| Projects and service | Projects, timesheets, SLA/cases, field dispatch and commercial controls | Templates, dependencies/Gantt, resource variance, customer portal, knowledge/CSAT, installed base/warranty, mobile offline worksheets | P1 |
| Marketing and engagement | Consent-led campaigns and interaction records | Actual provider delivery, journeys, A/B tests, opt-out suppression, event/survey/NPS/social, attribution/revenue model | P1 |
| Documents, analytics and AI | Encrypted attachments, PDFs, operational dashboards | Versioned document lifecycle, e-sign, retention/search, semantic metrics, report/pivot builder, scheduled reports, governed AI work queues with citations and approvals | P1 |
| Ecosystem and extensibility | Custom fields, internal events, controlled adapters | Module manifest, custom objects/forms, workflow/automation builder, API keys/scopes, webhooks, connector SDK/marketplace, mobile/portal apps | P2 |

## Execution order

### Wave 0 — Stabilisation and capability truth (now)

- Isolate each sidebar workspace so only its relevant workbench is mounted. **Completed.**
- Restrict internal workbench tabs to their owning module; preserve the owning context for shared desks and visibly explain genuine cross-domain handoffs. **Completed for the current workspace shell.**
- Preserve an operator's submitted values when a command is rejected, and keep nested workbench tabs in the workspace that owns them. **Completed for the current workspace shell.**
- Add a capability registry with `ready`, `partial`, `certification-required`, and `planned` states.
- Establish a release gate: every visible command must have an end-to-end create → approve → post/close → report test, keyboard path, responsive layout, and error recovery.
- Enforce resource and field permissions in IPC before rendering or mutating sensitive records. **Started:** privileged kernel/storage and sensitive operational paths are protected; complete all remaining domain routes and filtered read models before multi-user release.

### Wave 1 — Financial kernel and India statutory close

- **Foundation delivered:** bind an India profile only to a matching INR/April legal entity and branch; seed a company chart; provision periods only through the binding workflow; create exactly balanced, fiscal-year-numbered manual journals; require an independent poster; preserve an ordered verifiable immutable hash chain; create standalone reversals with auditable draft cancellation; expose a branch-scoped trial balance; and prepare a checksum-verified issued revenue invoice as one replay-safe source draft while blocking a duplicate legacy export.
- Preserve current accounting-handoff safeguards, then make them idempotent inputs to source-specific posting rules. Do not relabel a handoff as posted merely because it is balanced or exported.
- Build the remaining dimensions/cost centres, controlled period close/reopen, account governance, AR/AP subledgers, bank reconciliation, financial statements, budgets, fixed assets, FX/revaluation, consolidation, and source-to-GL reconciliation.
- Deliver P&L, balance sheet, cash flow, bank reconciliation, AP/AR, budget control, fixed-asset/depreciation, and the India statutory-close foundation.
- Add GST return workpapers (GSTR-1, 2B reconciliation, 3B), filing calendar/evidence, and certification-gated provider connectors.

### Wave 2 — Platform, identity, integrations, and reports

- Central/local-sync architecture, signed outbox, conflict handling, recovery drills, observability, MFA/passkeys, SSO, device sessions, and SCIM.
- Scopes, API keys, versioned public API, webhooks with idempotency/signature/retry, connector conformance tests, and integration monitoring.
- Module registry, custom objects/forms, workflow designer, automation rules, saved views and governed report builder.

### Wave 3 — Plan, procure, make, and maintain

- Material requests, supplier scorecards/agreements, budget commitments, MRP/MPS, multilevel planning, subcontracting, capacity/OEE, PLM/ECO and CAPA.
- Phase 2C.10/2C.11 now complete the asset lifecycle depth: sale disposal with customer/GST/gain evidence, impairment/reversal and fair-value revaluation, warranty/AMC, meter-triggered corrective work, calibration, spares, fleet, and installed-base history. Schema v36, scoped read projection, governed lifecycle IPC, and canonical asset-lifecycle GL preparation are included. Phase 3 begins with finance-close/reversal hardening, provider certification, sync/observability, and responsive/mobile-quality completion.
- Phase 2C.1 delivered a controlled operational installed-asset register and preventive-maintenance workflow. Asset categories and equipment passports carry company/branch scope and source/custody evidence; activation is independently decided; due plans generate technician-assigned work orders; required checklist completion and evidence precede an independent verify/reopen decision. The asset-maintenance read projection and typed IPC routes enforce the resource, scope, and field boundary before records are shown or mutated.
- Phase 2C.3–2C.6 now deliver depreciation, controlled no-proceeds retirement, reconciliation, and within-branch custody: an approved, effective-dated policy produces a residual-aware full-month depreciation run only after the exact capitalisation source has posted; a retirement then freezes the aggregate current book and independently removes cost/posted depreciation while recognising only NBV as loss; the General Ledger assembles the cost/depreciation/NBV roll-forward from active posted source evidence and highlights unlinked manual control-account entries; and physical movement is controlled by frozen source custody, separate approval and third-person destination receipt without creating a fictitious accounting transfer. Canonical preparation and posting remain separate, and physical retirement completion is blocked until that exact journal posts. Continue with componentisation, inter-branch transfer accounting, sale disposal/impairment, revaluation, warranties/AMC, meter and corrective maintenance, calibration, spare parts, fleet, repair, and serialized installed-base history. Do not equate these controlled slices with full fixed-asset accounting.

### Wave 4 — Commerce, customer growth, and service lifecycle

- POS, barcode/mobile retail, shifts/cash control, returns, UPI/payment providers, subscriptions, rentals, loyalty, partner commissions, customer/supplier portals, and marketplace adapters.
- CRM channel packs, web lead capture, marketing journeys, events/surveys/NPS, service knowledge base/CSAT, field-mobile execution.

### Wave 5 — Decision intelligence and India vertical packs

- Semantic metric definitions, drill-through/pivots, scheduled reporting, anomaly review, and planning/forecasting.
- Governed AI: permission-filtered retrieval, citations, tool-level RBAC, approval-required actions, audit/replay and evaluations. AI never posts finance or statutory outcomes autonomously.
- Packaged India verticals for distribution, manufacturing, professional services, construction, and retail only after the shared spine is stable.

## Reference and reuse policy

The three products are architecture and behavioural benchmarks, not a permission to copy indiscriminately.

- **Aureus ERP:** MIT at its repository root; compatible patterns may be adapted with attribution and preserved notices. Its [plugin catalogue](https://github.com/aureuserp/aureuserp/blob/master/README.md) is useful for modularity, chatter, table views, support, analytics, fields, and public API boundaries.
- **ERPNext:** GPL-3.0. Use its [module catalogue](https://github.com/frappe/erpnext/blob/develop/erpnext/modules.txt) and behaviours as clean-room reference unless a deliberate GPL-compatible or service-boundary decision is made. Do not copy implementation into this MIT Electron product.
- **Odoo:** the public repository is LGPLv3 and individual files can differ; use the [Odoo license](https://raw.githubusercontent.com/odoo/odoo/19.0/LICENSE) and per-file verification. Its [application catalogue](https://www.odoo.com/documentation/19.0/applications.html) and [India localization documentation](https://www.odoo.com/documentation/19.0/applications/finance/fiscal_localizations/india.html) are useful breadth benchmarks, including GST return workflows.

The binding local rule is [THIRD_PARTY_REUSE.md](./THIRD_PARTY_REUSE.md). EPIC remains a clean-room TypeScript/Electron implementation unless the licensing decision changes explicitly.

## Definition of done for every future module

1. A named business owner, workflow state model, permissions, audit events, data-retention policy, and migration are defined.
2. A user can create, review, approve/reject, reverse/correct where applicable, and report on the record without leaving the governed workflow.
3. Cross-domain posting/handoff is idempotent, traceable, and cannot silently bypass period, credit, tax, or segregation-of-duties controls.
4. The workspace is contextual: its menu, primary action, tabs, records, empty states, and keyboard flow are aligned to the module.
5. Tests cover the critical path and failures; adapters additionally require conformance and certification status.
