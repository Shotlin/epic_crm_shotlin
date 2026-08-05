# Phase 0 — Product Control Baseline

**Status:** baseline complete; release gate remains continuous as of 2026-07-16  
**Purpose:** turn the EPIC Business OS charter into a finite, testable delivery contract.  
**Rule:** no reference capability is silently omitted. Every capability is either built, integrated behind a licensed boundary, explicitly excluded with a signed rationale, or assigned to a later phase.

## Source baselines and reuse guard

| Source | Audited baseline | Use in EPIC |
| --- | --- | --- |
| Aureus ERP | `f7ac9c6`, MIT | Compatible code may be adapted with attribution and preserved notices. |
| ERPNext | `576a5d2`, GPL-3.0 | Behavioural and architectural reference only unless the product licensing decision changes. |
| Odoo | `2cb2f33`, LGPL-3.0 / file-specific notices | Reference or separately bounded integration only after per-file license review. |

The binding rules are in [THIRD_PARTY_REUSE.md](./THIRD_PARTY_REUSE.md). A reference repository is never copied into the Electron core merely to accelerate a phase.

## Capability ledger contract

The delivery register uses these statuses:

- `ready`: governed critical path, persistence, UI, permissions, audit, migration, and acceptance evidence exist.
- `partial`: a useful workflow exists but at least one completion gate is missing.
- `planned`: intentionally scheduled, but no production workflow claim is made.
- `certification-required`: code boundary can be complete but production use requires external provider or professional certification.

Every atomic row in the full register must carry:

`ID · business lifecycle · reference source/version/path · EPIC evidence · state · build/integrate/exclude · license/provenance · owner/scope/classification · permissions/SoD · migration/retention · UI/API · acceptance-test ID · release phase · accountable owner`

## Initial executive capability matrix

| ID | Product family | Current state | Completion target | Reference benchmark | Release phase |
| --- | --- | --- | --- | --- | --- |
| CTRL-01 | Tenancy, company, branch, RBAC, audit | partial | filtered reads, field redaction, device/session controls, recovery and observability | Aureus Security, ERPNext Setup, Odoo auth | 1 |
| CTRL-02 | Workflow, approvals, SoD, documents | partial | every critical lifecycle has controlled correction/reversal and evidence | all three | 1–2 |
| FIN-01 | General ledger and source-to-GL | partial | AR/AP, source adapters, dimensions, statements, period controls, reconciliation | ERPNext Accounts, Odoo Account/Analytic | 4 |
| IND-01 | India tax and statutory close | certification-required | GSTR-1/2B/3B, ITC, calendar/evidence, GSTIN verification, certified filing packs | ERPNext Regional/EDI, Odoo `l10n_in*` | 4 |
| CRM-01 | Party, CRM, sales and revenue | partial | channels, web capture, sequences, teams, quotas, commissions, e-sign/payment, portals | ERPNext CRM/Selling, Odoo CRM/Sales | 3 |
| COM-01 | POS, payments, subscriptions, commerce | planned | cash shifts, barcode retail, UPI, loyalty, rentals, marketplace/commerce | ERPNext POS/Subscriptions, Odoo POS/Payment/Website | 7 |
| SCM-01 | Procurement and supplier lifecycle | partial | requisitions, contracts, tender, scorecards, catalogues, supplier portal | ERPNext Buying, Odoo Purchase | 5 |
| SCM-02 | Inventory and warehouse | partial | RF/GS1 scanning, waves, cross-dock, consignment, dropship, advanced replenishment | ERPNext Stock, Odoo Stock | 5 |
| MFG-01 | Manufacturing and quality | partial | MRP/MPS, finite scheduling, subcontracting, OEE, PLM/ECO, CAPA, calibration | ERPNext Manufacturing/Quality, Odoo MRP | 5 |
| AST-01 | Assets, maintenance, fleet and repair | planned | capitalization, depreciation, equipment, maintenance, warranty, spares, fleet | ERPNext Assets/Maintenance, Odoo Maintenance/Fleet/Repair | 6 |
| PPL-01 | Employee lifecycle and payroll | partial | org master, recruitment, onboarding, performance, skills, overtime, planning | ERPNext HR, Odoo HR/Recruitment/Skills | 6 |
| SRV-01 | Projects, support and field service | partial | dependencies/Gantt, resource variance, portals, knowledge, CSAT, installed base, offline worksheets | ERPNext Projects/Support, Odoo Project/Helpdesk | 6 |
| ENG-01 | Marketing and engagement | partial | actual delivery, journeys, experiments, events, surveys, attribution | ERPNext Communication/Telephony, Odoo Marketing | 7 |
| EXT-01 | APIs, webhooks, custom objects and automation | partial | API keys/scopes, versioned API, webhooks, SDK, custom objects/forms, automation builder | Aureus Plugins/Fields/Table Views, Odoo Automation | 8 |
| INS-01 | Reports, analytics and governed AI | planned | semantic metrics, pivots, scheduled reports, planning, cited and approved AI actions | Aureus Analytics, Odoo Spreadsheet/AI-adjacent apps | 8 |
| EXP-01 | UX, accessibility and release quality | partial | list/detail/create-to-close workflow coverage, readiness labels, keyboard/responsive/error recovery | Aureus Table Views/Chatter, Odoo modular apps | 2 |
| OPS-01 | Sync, release operations and certification | planned | signed updates, sync/outbox/conflicts, telemetry, recovery drills, load/security tests | enterprise operating baseline | 9 |

## Non-negotiable phase gate

A phase cannot close until every included capability has all of the following:

1. A stable data model, migration, retention/classification, and company/branch scope.
2. Explicit resources, field policy, ownership and segregation-of-duties rules.
3. Create → review → approve/post/close → report lifecycle, plus controlled correction when relevant.
4. A usable Electron workflow: list, detail, create, empty/error/loading states, keyboard path, and responsive behaviour.
5. Contract, domain, IPC, persistence, and renderer critical-path tests; plus package smoke verification.
6. A documented source/provenance and certification decision for every external dependency or provider.

## Delivery SOP

1. **Intake:** add a capability row and its reference evidence before implementation begins.
2. **Design review:** lock lifecycle, data ownership, scope, privacy class, permissions, SoD, integrations, and test IDs.
3. **Vertical implementation:** deliver schema, migration, domain command, IPC boundary, UI, reports, and tests together.
4. **Evidence review:** run automated gates, package the Electron app, and record the acceptance result against the row.
5. **Release review:** only mark `ready` after the full gate passes; provider integrations remain `certification-required` until certified.
6. **Change control:** scope additions enter the next wave unless a safety defect requires immediate work.

## Phase 1 starting definition

The first Phase 1 release is **not** a claim of complete multi-company isolation. It must first replace the raw Revenue Operations snapshot with an actor-aware projection that:

- filters every scoped row by the authorised company and branch;
- fails closed for a scoped record outside the active scope;
- applies denied-field redaction before IPC returns data;
- does not expose credentials, secret material, or cross-scope totals;
- is proved with cross-company and field-redaction regression tests.

This document is the governing entry point for the detailed capability register. The existing [ARCHITECTURE_PARITY_LEDGER.md](./ARCHITECTURE_PARITY_LEDGER.md) remains the architectural narrative and gap analysis.
