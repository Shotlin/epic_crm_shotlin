# Epic BOS — Executive delivery plan

**Reviewed:** 2026-07-17  
**Decision:** Build the trust and finance spine before expanding module breadth.

## Honest position

EPIC BOS is **about 30–35% complete** against the requested end state: a production-capable, India-first business operating system with the combined functional breadth of Aureus ERP, ERPNext, Odoo, and EPIC-specific differentiation. It is **not yet half complete** against that goal.

The apparent completion depends on what is measured:

| Measure | Current estimate | Meaning |
| --- | ---: | --- |
| Visible workspace / workbench breadth | 50–55% | Many domain desks and first-pass workflows exist. |
| End-to-end charter and reference-product parity | 30–35% | Connected accounting, platform, assets, reporting, commerce, integrations, and close controls are still incomplete. |
| Controlled single-device internal pilot readiness | about 55% | Suitable for supervised demonstration and non-sensitive pilot scenarios after local validation. |
| Multi-user production readiness | 15–20% | Not yet safe for regulated finance, payroll, or multi-tenant production use. |

These are capability estimates, not code-volume estimates. A large UI surface is not treated as complete until it has a governed workflow, persistence, permissions, audit evidence, error recovery, and acceptance coverage.

## What is materially built

- Business kernel: local Electron runtime, company/branch structure, users, RBAC model, approvals, audit evidence, workflows, attachments, migrations, and backup/restore.
- CRM and commercial foundation: party master, deduplication/merge, leads, opportunities, scoring, campaigns, quotations, orders, invoice/receivable workflows, and India GST commercial controls.
- Operational foundation: procurement, inventory/warehouse, manufacturing/quality, payroll/people, projects, service, treasury, statutory-adapter boundaries, and many related workbenches.
- Canonical finance foundation: India legal-entity binding, chart of accounts, periods, manual journals, maker/checker posting, immutable hash chain, reversals, and trial balance.
- Phase 2B core connected-finance bridge: issued invoices, reconciled receipts, credit/debit adjustments, matched supplier invoices, and independently approved project-revenue recognition are semantically checked, replay-safe, checksum-bound, and prepared as canonical GL drafts; a separate checker posts each journal. Supported legacy export paths are blocked once their canonical source exists, so one business event cannot be booked twice.
- Phase 2C.1 operational asset control: company/branch-scoped asset categories and installed-equipment passports, independent activation, preventive plans, due work-order generation, technician execution, checklist/evidence completion, and independent verification/reopen control.
- Phase 2C.2 controlled capitalisation bridge: procurement-backed, in-service assets reserve taxable supplier-invoice cost; independent approval creates a checksum-protected `fixed-assets`/`inventory-asset` source handoff; the canonical book requires the linked AP source to be posted first.
- Phase 2C.3 fixed-asset depreciation: effective-dated residual-aware full-month policies and independently approved monthly schedules prepare checksum-bound `depreciation-expense`/`accumulated-depreciation` source drafts only from posted capitalisations.
- Phase 2C.4 no-proceeds retirement: a GL-derived aggregate book summary freezes cost, posted depreciation and NBV for independent approval; canonical GL prepares the loss-bearing removal, and the physical asset cannot be retired until that exact journal posts.
- Phase 2C.5 fixed-asset reconciliation: the General Ledger now derives a reversal-aware cost, accumulated-depreciation, loss and NBV roll-forward from posted fixed-asset source journals, while surfacing unlinked manual control-account movement as an explicit attention state.
- Phase 2C.6 custody transfer: an asset source location and version are frozen at request; a separate approver revalidates it; and a third person must receive the asset before the within-branch equipment passport changes. Active retirement and unverified maintenance work prevent movement.
- Phase 2C.7 component passport: replaceable physical components are recorded against an immutable parent-asset version, with serial/criticality/serviceability evidence and independent approval. The first slice is intentionally non-financial; component cost allocation and component-aware depreciation are a separate ledger boundary.
- Phase 2C.8 component finance boundary: approved passports can receive an exactly reconciled parent-cost allocation, independently approved component useful-life/residual assumptions, and component-aware monthly depreciation lines. The allocation is a subledger attribution and never duplicates the parent fixed-asset GL cost.
- Phase 2C.9 inter-branch transfer accounting: a frozen source book, destination legal-entity evidence, balanced clearing handoff, independent dispatch, and fourth-party destination receipt are now controlled through a dedicated transfer workbench.
- Phase 2C.10/2C.11 asset lifecycle completion: sale disposal with customer/GST/gain evidence; impairment/reversal and fair-value revaluation; warranty/AMC; meter-triggered corrective maintenance; calibration; spares; fleet; and installed-base history are now persisted behind one governed lifecycle action bridge and canonical GL adapter.

## What remains before an “enterprise-ready” claim

| Product family | Current coverage | Priority gap |
| --- | ---: | --- |
| Kernel, security and control | ~60% | Complete IPC authorization, record/field scope, identity lifecycle, encrypted recovery bundle, central-sync boundary, release operations. |
| CRM and party | ~60% | Live communication channels, web capture, sequences, teams/quotas, portals and partner ecosystem. |
| Sales and commerce | ~45% | POS, UPI, subscriptions, rentals, loyalty, retail barcode and marketplaces. |
| Finance and India compliance | ~25–30% | Source-to-GL family, AR/AP, close, statements, bank reconciliation, GST workpapers, assets, FX, budgets and consolidation. |
| Procurement and warehouse | ~55% | Requisitions, agreements, supplier portal, scanning, advanced pick/pack and dropship. |
| Manufacturing and quality | ~40% | MRP/MPS, subcontracting, OEE, PLM/ECO, CAPA and calibration. |
| People, projects and service | ~45% | Recruitment, onboarding, performance, skills, resource planning, customer portal and offline field work. |
| Assets and maintenance | Phase 2C.11 lifecycle slice | Controlled installed-asset register, preventive maintenance, capitalisation, depreciation, no-proceeds retirement, posted-evidence reconciliation, custody transfer, component passports/allocation, inter-branch transfer accounting, sale disposal, impairment/revaluation, warranty/AMC, meters/corrective work, calibration, spares, fleet, and installed-base history are live. |
| Analytics, AI and ecosystem | ~15–20% | Report builder, semantic metrics, scheduled reports, API/webhooks, automation, connector SDK and governed AI. |

## Delivery sequence

### 0. Capability truth and user trust — baseline complete; release gate continuous

Expose only working workbenches, label partial/certification-required capability, test every visible action, and keep workspace ownership clear. The Phase 0 control baseline is recorded in [PHASE_0_PRODUCT_CONTROL.md](./PHASE_0_PRODUCT_CONTROL.md); its source, licensing, acceptance, ownership, and release requirements remain a continuous release gate.

### 1. Authorization and resilience perimeter — immediate P0

Password changes already revoke every active device session and force a fresh sign-in. A central IPC manifest now classifies every declared bridge route and rejects unknown routes; finance and backup policy is centrally scoped; canonical CRM, Party Master, and CRM depth endpoint checks resolve against their persisted company as well as the session, and CRM depth fails closed if CRM and Party Master scopes disagree; legacy CRM demonstration state is upgraded to the Kernel-scoped company identifier. Revenue Operations schema v18 binds the shared commercial, inventory, statutory, provider, collections, finance, procurement, treasury, manufacturing, delivery, workforce, payroll, and project state to a persisted company and branch; every permissioned route in those families resolves through that binding and it must agree with the CRM/Party company plus an active Kernel branch. Schema v19 adds durable company/branch scope to quotations, sales orders, invoices, receivables, payment receipts, and credit/debit notes; new documents inherit scope from the commercial chain, older documents are upgraded, and quote/invoice PDF export re-checks the requested record before rendering. CRM opportunities enforce their existing grants; Party Master has its own versioned `crm.party` permission for account/contact, quality, consent, merge, relationship, and conversion changes; CRM pipeline, scoring, campaign, shared-view, and audience-segment administration requires `crm.configuration`; lead-import preview and commit require `crm.import`, and commit separately checks lead-creation authority; connector configuration requires `crm.integration`, and interaction capture requires both `crm.communication/create` and Party Master read access; core sales execution is separated into commercial-maker and commercial-approver grants; the receivables lifecycle uses distinct commercial-preparer and finance-controller authority; and the India trading profile, territory fabric, pricing, and catalog are resource-governed. Price books require an independently decided activation before use in a quotation, with draft/submitted/active/rejected state and UI controls. Legacy operational routes retain a guaranteed session baseline. Next, promote those routes to resource-level policy; extend the document-record scope slice to lifecycle mutations and other operational entities, then add row-filtered and field-scoped read models; revoke sessions on user/role/scope changes; ship encrypted, verified recovery bundles; and make the current single-device operating boundary explicit while central sync is designed.

The commercial lifecycle now also re-checks the referenced record scope before quote transition/approval/conversion, order and fulfilment changes, delivery/milestone work, invoice preparation and issue, credit/debit adjustment, payment reconciliation, and payment capture. A receipt can allocate only to receivables in one company-and-branch scope, and persists that allocation scope; an unapplied receipt resolves to the active operating scope.

Authorization changes now revoke affected active sessions: company and branch updates, role-policy and field-policy changes, approval-policy changes, and role assignment all require a fresh sign-in before the next business action. Full row-filtered multi-company projections remain pending the addition of durable ownership scope to the remaining operational entities; the system intentionally does not label the current broad Revenue Operations snapshot as multi-company safe.

Schema v20 establishes that provenance across the inventory/warehouse slice, including master data, physical custody, valuation layers, ledger evidence, operational tasks, transfers, counts, and reorder/valuation controls. Inventory routes now resolve a concrete record or scoped parent before mutation. The next scope slices are procurement, workforce/payroll, delivery, and manufacturing; only once their read-side provenance is complete will the broad workspace snapshot be promoted to a filtered multi-company projection.

Schema v21 completes the procurement provenance slice. Supplier onboarding, sourcing, bid comparison, purchasing, goods receipt, landed-cost capitalization, supplier invoicing, and three-way matching now inherit and re-check company/branch scope at their lifecycle boundary. The next work moves to manufacturing, delivery, and workforce/payroll record scope; the broad snapshot remains intentionally unlabelled as multi-company safe until those row-level records are complete.

Schema v22 extends this control model across manufacturing engineering, quality, and production execution. The next slices are delivery/service and workforce/payroll, after which scoped read projections can be designed without overstating multi-company isolation.

Schema v24 now completes durable write-side provenance and lifecycle authorization for delivery/service and workforce/payroll. Remaining write-side slices are financial close, collections, treasury, statutory controls, and project-commercial records; broad snapshots remain intentionally unlabelled as multi-company-safe until their filtered read models are delivered.

Schema v25 completes the financial-close, collections, treasury, and project-commercial provenance slice. The next write-side boundary is statutory/provider control records, followed by row-filtered read projections and field-level policy enforcement.

Schema v26 completes the statutory/provider control slice. Phase 1A/1B delivers the first filtered, permission-aware read projection: all workforce/payroll data leaving Revenue Operations IPC is exact company-and-branch scoped, collection-denied data is empty, field-denied data is removed, and affected aggregates are omitted as restricted. Phase 1C applies the same boundary to delivery/service, finance controls, supply chain, and statutory/provider controls: project, task, time-entry, agreement, support, field-service, receivable, collection, bank matching, treasury, supplier, procurement, inventory master, valuation, warehouse, replenishment, statutory exchange, provider connector, submission, and reconciliation rows are scope-filtered; restricted internal time cost, financial exposure, stock/value, and portal/provider fields remove their dependent metrics. The central output normalizer covers both bare snapshots and nested mutation envelopes. Phase 1D extends it to sales catalog, pricing, approval, quotation/order/fulfilment, document, payment-term, evidence, and milestone collections; these now have durable operating provenance and a policy-aware, exact-scope read projection. CRM’s engagement workspace is now branch-owned and its primary snapshot/lead/activity routes authorize against that persisted branch. Party Master remains company-owned by design. CRM-depth configuration and wider cross-branch collaboration remain separate governed work before all CRM read models are called multi-branch complete.

### 2. Connected finance spine — active P0

Phase 2B core is complete for issued invoices, reconciled cash receipts, commercial adjustments, matched AP invoices, and approved project revenue recognition. The implementation uses exact business evidence, bound company/branch scope, replay identity, checksum verification, active-account/open-period checks, independent posting, and duplicate-export exclusion. Project billing must post recognition before invoicing clears unbilled revenue; AP must prove its supplier/PO/GRN/invoice/match chain; canonical-posted sources satisfy financial close without being rewritten as legacy exports.

The remaining adapter family is explicitly outstanding: landed cost, treasury/bank, inventory/manufacturing, payroll/expense, write-off/withholding, and future statutory source entries. Each must be idempotent, checksum-bound, maker/checker controlled, period-aware, reconciled, and unable to coexist with a duplicate export.

### 2C.1. Installed assets and preventive maintenance - foundation delivered; expansion active

The first asset-and-maintenance slice establishes a controlled operational installed base rather than pretending that physical custody is already fixed-asset accounting. It includes asset categories and equipment passports with source/custody evidence; draft to submitted to independently activated in-service assets; preventive plans with controlled checklists; one due work order per plan/date; assigned-technician execution; required-checklist and completion-evidence capture; and independent verification or reopen before the next service cycle advances.

Every asset category, installed asset, plan, and work order carries exact company-and-branch scope. Read projection applies resource permission, scope filtering, and field redaction before the renderer receives the records. Typed IPC routes re-authorize the referenced scoped record, while separate asset-steward, asset-controller, and maintenance-technician responsibilities preserve the workflow's maker/checker boundary.

Explicitly deferred from Phase 2C.1: procurement capitalization bridge, depreciation, transfer/disposal/impairment, warranties/AMC, meter-based and corrective maintenance, calibration, spare-parts control, and fleet. These are subsequent controlled slices; Phase 2C.1 must not be represented as full fixed-asset accounting or complete maintenance parity.

### 2C.2. Procurement capitalisation bridge - delivered

Phase 2C.2 connects the procurement/AP and asset-control boundaries without claiming that an operational passport is itself an accounting asset. A maker selects an in-service procurement-evidenced asset, matched supplier invoice, capitalisation date, and taxable amount. Submitted allocations reserve invoice taxable cost to prevent duplicate allocation; an independent approver either rejects the request or creates the balanced, checksummed source handoff. Canonical preparation independently revalidates the asset, PO, GRN, invoice, three-way match, scope, amount, checksum, open period, chart accounts and posted AP prerequisite. A different ledger poster remains required to make the transfer immutable.

The renderer exposes this as a distinct Capitalisation Control lane and a General Ledger source bridge.

### 2C.3. Fixed-asset depreciation subledger - delivered

Phase 2C.3 adds effective-dated, independently approved straight-line full-month depreciation policies by asset category. A monthly run is generated only from asset-capitalisation sources whose canonical journals are posted. It calculates residual-aware rounded monthly charges, blocks duplicate active asset/month runs, carries maker/checker evidence, and creates one checksummed `depreciation-expense` / `accumulated-depreciation` source handoff only after independent approval. The ledger revalidates scope, original asset cost, policy/category/effective-date selection, service-month index, residual and charge calculation, posted capitalisation prerequisite, checksum, chart, and open period before it prepares the replay-safe draft. Posting remains separate.

### 2C.4. No-proceeds asset retirement - delivered

Phase 2C.4 adds a strict loss-only retirement path without presenting it as a sale. The source workflow receives an aggregate canonical book summary rather than GL lines; submission freezes gross cost, posted accumulated depreciation and NBV, and independent approval creates a checksummed source handoff. Canonical GL recomputes the current unreversed source chain and allows exactly the resulting debit to accumulated depreciation, debit to asset-retirement loss where needed, and fixed-asset cost credit. A separate ledger poster posts the draft; only then can a separate asset-controller complete physical retirement. Read projection, maker/checker RBAC migration, typed IPC, desktop workbench and journal bridge are all included.

### 2C.5. Fixed-asset roll-forward and reconciliation - delivered

Phase 2C.5 gives Finance one ledger-native, as-of roll-forward for gross cost, accumulated depreciation, retirement release, retirement loss and net book value. Only active posted capitalisation, depreciation and retirement source journals contribute to the governed subledger view; a posted reversal removes both itself and its reversed original from the roll-forward. Manual entries touching the fixed-assets or accumulated-depreciation control accounts are never silently classified as asset-subledger movement: the amount and count remain visible, and the result is marked for attention until corrected or properly reversed. The General Ledger workbench renders the summary with source counts and evidence status.

### 2C.6. Within-branch asset custody transfer - delivered

Phase 2C.6 adds a physical chain-of-custody workflow without pretending it is a financial transfer. An in-service asset starts from a frozen source warehouse/work-center/custody label and source version. The maker cannot approve their request; the approver cannot receive it; and receipt by a third person is the only step that updates the asset passport. The source must remain unchanged, no maintenance work may be open, and no retirement workflow may be active. Destination fields preserve their current assignment when omitted to prevent accidental control loss. The workflow is typed through Electron IPC, has a dedicated maker/approver/receiver authorization migration, reads through the scoped asset projection, and has its own desktop workbench.

### 2C.7. Physical component passport - delivered

Phase 2C.7 makes installed equipment serviceable at component level without corrupting the book of accounts. A maker submits a dated, evidence-backed passport containing two-to-fifty replaceable components; tags and serials are unique within the scoped asset history, categories are active and in scope, and open maintenance or retirement blocks the change. An independent approver accepts or rejects the source-asset-version snapshot. The componentization record is separately scoped, permissioned, migrated, projected, and exposed through the Electron workbench. No cost or depreciation is allocated to components in this slice; that financial model follows only after a governed allocation and component-aware depreciation policy is implemented.

Remaining 2C hardening is canonical close/reversal coverage, production provider certification, and responsive UI completion for the new lifecycle cockpit; the domain and IPC slices are complete.

### 2C.8. Component cost allocation and component-aware depreciation - delivered

Phase 2C.8 separates physical identity from financial attribution without losing the parent book boundary. An approved component passport and approved, posted parent capitalisation are prerequisites. Finance submits one line for every component; positive percentages must total exactly 100%, rounded allocated cost must reconcile to the parent taxable cost, and an independent checker approves the assumptions. The approved allocation remains a subledger attribution—there is no second fixed-asset GL cost journal. Monthly depreciation consumes the component allocation when present, carrying component identity, allocated cost, life, residual, and depreciation amount into the existing checksum-bound depreciation handoff. Schema v33, scoped read projection, RBAC migration, IPC, Electron queue, and regression coverage are included.

Remaining 2C hardening is canonical close/reversal coverage, production provider certification, and responsive UI completion for the new lifecycle cockpit; the domain and IPC slices are complete.

### 2C.9. Inter-branch and inter-company transfer accounting - delivered

Phase 2C.9 treats a legal-entity or branch move as a controlled financial handoff, not a warehouse edit. Submission freezes the source asset version and reconciled gross cost, posted accumulated depreciation, and NBV. The destination company and branch are explicit, the maker cannot approve, approval creates a balanced source-side accumulated-depreciation / cash-in-transit / fixed-assets draft, dispatch is separate, and a fourth-party destination custodian must receive the asset. The workflow is persisted at schema v34, scope-projected, RBAC-protected, IPC-validated, and visible in Electron. The source asset passport remains unchanged until a future destination-ledger ingestion completes the receiving-side accounting boundary.

### 2C.10/2C.11. Asset lifecycle and service depth - delivered

Sale disposal freezes the current canonical book, captures the customer and Indian GST evidence, posts balanced proceeds/gain-or-loss lines, and retires the passport only after canonical GL posting. Impairment/revaluation records carry recoverable/fair value evidence and independent approval into dedicated GL source drafts. Warranty, AMC, meter threshold, corrective maintenance, calibration, spare issue, fleet trip, and installed-base history records use typed scope, version, evidence, and maker/checker controls. Schema v36 and the Electron lifecycle action bridge are included.

Phase 3 starts with hardening: canonical close/reversal coverage, AR/AP/statutory close, operational observability, provider certification, and UI/mobile-quality completion.

### 3. Complete core finance and India close — P0

Add dimensions/cost centres, controlled close/reopen, account maintenance, AR/AP subledgers, bank reconciliation, P&L/balance sheet/cash flow, budgets, fixed assets/depreciation, FX/revaluation, consolidation, and GSTR-1/2B/3B workpapers with filing evidence.

### 4. Platform and extensibility — P0/P1

Deliver MFA/passkeys/SSO, device sessions, sync/outbox/conflicts, observability, signed releases/updates, API keys, versioned API, webhooks, connector conformance, custom objects/forms and governed automation.

### 5. Operational parity waves — P1

Finish procurement/warehouse, MRP/MPS, subcontracting/OEE/PLM/CAPA, Phase 3 asset/maintenance close hardening, commerce/retail, people lifecycle, portals, mobile field work, and engagement channels.

### 6. Decision intelligence — P1/P2

Build semantic reporting, planning, anomaly review, and only then permission-filtered AI work queues with citations, approvals, audit replay, and no autonomous financial/statutory posting.

## Non-negotiable completion rule

No module is called complete merely because its screen exists. It must have an owner, state model, permissions, migration, audit trail, create-to-close/reversal journey, reporting, responsive and keyboard path, error recovery, and automated critical-path coverage. External adapters additionally require provider conformance and legal/accounting sign-off before production activation.
