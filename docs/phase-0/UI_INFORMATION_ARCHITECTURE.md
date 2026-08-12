# Bakaloo Retail Business OS — UI Information Architecture

## Product principle

The same system must feel immediate to a new cashier and powerful to a finance controller. The default path is a direct task. Advanced controls appear only when a role needs them and the underlying data/control state allows them.

## Primary navigation

The retail shell uses one persistent left rail and at most three navigation levels:

| Primary area | Plain-language job | Typical submodules |
| --- | --- | --- |
| Home | See what needs attention now | Today, exceptions, approvals, store health |
| Sell | Sell and close a counter shift | POS, returns/exchanges, shifts, cash close |
| Orders | Pack and resolve customer orders | Unified queue, picking, dispatch, returns/RTO |
| Inventory | Keep stock correct | Products, stock, counts, expiry, transfers |
| Purchase | Bring in and price stock | Suppliers, purchase orders, GRN, landed cost |
| Customers | Look after customers | Customer 360, loyalty, wallet, vouchers, consent |
| Delivery | Fulfil and track delivery | Serviceability, slots, riders, COD, proof of delivery |
| Finance | Explain every rupee | Cash, settlements, GST, invoices, collections, close |
| People | Run store teams | Staff, attendance, shifts, payroll handoff |
| Analytics | Make a decision from trusted data | Sales, margin, stock risk, customer, outlet performance |
| Administration | Change controlled settings | Organisation, roles, approvals, integrations, release evidence |

The existing Home/Sell/Stock/Deliver/Customers/Money/Insights/Setup rail remains the Store Edge shorthand. The long-form labels are used in shared Hub and Dashboard navigation. Do not display generic CRM, Command or foreign-business demo lanes to normal retail roles.

## Role workspaces

| Role | First screen | Primary actions | Hidden/secondary controls |
| --- | --- | --- | --- |
| Cashier | Sell | Scan, pay, receipt, return request, close shift | Pricing policy, settlement, catalog master |
| Store manager | Home | Approve exceptions, close cash, count stock, receive transfer, resolve order issue | Organisation-wide finance and provider settings |
| Inventory/purchase lead | Inventory | Receive GRN, transfer, count, expiry, reorder | Customer/finance data beyond need-to-know |
| Delivery coordinator | Orders / Delivery | Pick, assign, dispatch, exception, COD custody | Customer financial history |
| Finance controller | Finance | Reconcile, approve write-off/refund, GST workpaper, close | Device setup and cashier shortcuts |
| CRM/growth lead | Customers | Consent, segment, campaign, attribution | Payment, stock adjustment and provider secrets |
| Owner / administrator | Home | Organisation, role, approval, release and integration controls | Direct worker shortcut by default |

## Common page anatomy

1. Clear title and one-sentence purpose.
2. A single primary action that is safe for the current role/state.
3. Three to five decision KPIs with definitions, source, scope and freshness.
4. One chart only when it answers a decision; each chart has an accessible table/view-details alternative.
5. An exception or action queue with owner, due time and state.
6. Progressive disclosure for advanced filters, controls and audit evidence.

All workspaces have one vertical scroll owner. Panels do not create nested-scroll traps. Dense tables use explicit pagination/filtering and a pinned context header rather than a fixed-height invisible queue.

## Required visual and interaction standard

- Blue-white, high-contrast, India-first desktop interface; use the existing Epic BOS Sora/IBM Plex design system and INR/en-IN formats.
- Labelled Lucide icons support text; icon-only critical actions are prohibited.
- Controls are at least 44 px interactive targets and retain visible keyboard focus.
- Cards communicate a decision, not decoration. Avoid huge empty panels, generic pipeline placeholders, glass effects and invented numbers.
- Charts use line, bar, stacked bar, donut and heat-map patterns only where appropriate. Each has a data source, scope, freshness and drill-through.
- Visual status has text plus colour; never convey state by colour alone.

## Mandatory screen states

Every route must implement and test: loading, empty, error, partial data, permission denied, certification required, offline, stale, syncing, conflict, read-only, draft, submitted, approved, rejected and completed where relevant.

An empty state states what is missing, why it matters and the one permitted next action. An unavailable state never converts to zero. A map never shows a fallback location; it shows “location unavailable” until verified data meets permission, consent and freshness rules.
