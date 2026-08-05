# Epic BOS Retail Execution Ledger

Scope: Indian retail first. “Live” means a governed workflow exists in the Electron product; it does not imply a provider, hardware, or government portal has been certified.

## Production-safe Bakaloo migration (current execution wave)

Epic BOS is being prepared as Bakaloo's future retail operating system without
altering the live Bakaloo app, website, backend, dashboard, database, or
provider accounts. This is a parallel migration, not a replacement release.

- **Retail operator shell:** the primary Electron navigation now uses the
  plain-language retail tasks `Home`, `Sell`, `Stock`, `Deliver`,
  `Customers`, `Money`, `Insights`, and `Setup`. Each task routes to one
  existing governed workbench, while specialist ERP controls remain available
  as clearly labelled advanced tools rather than mixed into the default view.
- **Focused commercial desks:** POS, returns, products, devices, online
  orders, channels, reports, and branches mount one requested desk at a time.
  Normal Sales Channels is read-only; it cannot expose provider credentials,
  push a catalog, import an order, or manufacture an external result.
- **Customer truth:** the normal CRM entry is Customer 360 with a clear
  business-data action and an explicit empty/import state. The historic
  generic sample pipeline/dashboard is not part of the retail operator flow.
- **Electron provider boundary:** packaged production Electron rejects direct
  renderer requests to ingest external orders, record Hub/carrier outcomes,
  execute/record commerce syncs, import remote orders, record settlement
  receipts, or execute/record catalog/inventory pushes. Local counter POS is
  retained; trusted Hub/server integration is the future external path.
- **Cutover truth:** an operator can register a migration plan only from a
  fetched, read-only Retail Hub assessment. Typed checksums/counts, local JSON
  import, and manual plan registration are absent from the normal UI; the
  legacy direct IPC seam fails closed in packaged/production runtime.
- **Truthful workspace provenance:** a local workspace is explicitly shown as
  Demo, Clean, Imported, Live, or Needs review. Unclassified legacy records
  fail closed; automatic external writes remain blocked. The shell shows build
  version plus the actual safety state instead of claiming a healthy sync.
- **Safe demo handling:** the old generic sample can only be replaced through
  the existing confirmation-and-backup workflow when the main process has
  positively identified that exact demo. No real or unclassified workspace is
  reset automatically.
- **Retail Hub starter:** `retail-hub/` is an isolated read-only shadow-import
  contract. It verifies supplied export checksums and records batches,
  external-ID maps, cursors, count/checksum conflicts, and reconciliation
  reports. Its HTTP adapter accepts only GET/HEAD/OPTIONS; it does not connect
  to Bakaloo, persist source data, accept credentials, or write back to either
  system.
- **Shadow evidence registry seam:** verified plans are now held behind an
  explicit clone-on-read registry. The default adapter is in-memory and
  importer-only; the HTTP service has no mutation route. This gives the future
  PostgreSQL implementation a stable tenant/retention/rollback seam without
  pretending that local evidence is already production persistence.
- **Unified order boundary:** a source-neutral ingestion model now accepts
  only normalized evidence for POS, website, app, WhatsApp, ONDC, and
  marketplace orders. It retains external IDs and SHA-256 source digests,
  detects replay and lifecycle conflicts, creates stock *intent* only after
  approved mapping, and requires separate cancellation, return, or RTO
  reconciliation. It does not mutate inventory, collect money, or dispatch a
  delivery.
- **Delivery and map boundary:** provider-neutral delivery controls now fail
  closed for missing serviceability, credential-version conformance, route
  evidence, rider tracking consent, proof of delivery, and COD custody. No
  default city, fabricated pin, calculated ETA, or credential secret can enter
  this boundary.

### Next gated milestones

1. Obtain a **read-only**, scoped Bakaloo export or sandbox credential set and
   agree the mapping, retention, reconciliation threshold, rollback owner, and
   audit location.
2. Shadow-import catalog, inventory, customers, addresses, orders, payments,
   vouchers, refunds, riders, delivery, settlements, campaigns, reviews, and
   storefront content. Resolve every external-ID and balance variance before
   any local cutover decision.
3. Run read-only analytics in parallel, then governed catalog/inventory,
   orders, customer operations, delivery, finance, and finally storefront/API
   capability cutovers. Every stage requires reconciliation, approval, and a
   rollback window.

No API key, map credential, customer payload, order update, stock update,
payment, delivery event, or provider acknowledgement is fabricated or stored
in the Electron renderer.

## Live foundation

- Companies, branches, user accounts, RBAC, approvals, audit evidence, backups, and restore controls.
- India-first books: INR, GST/HSN, invoice/receivable/payment control, bank reconciliation, payroll, and finance close.
- Inventory truth: UOMs, variants, barcodes, warehouses, bins, batches, serials, expiry, putaway, picks, counts, reorder, cost layers, damage, and shrinkage.
- Sales core: catalog products, effective price lists, GST tax codes, discounts, quotations, orders, fulfilment, invoices, PDF evidence, and receivables.
- Retail counter POS: governed counter/bin/price-book setup, touch category & brand filtering, multi-field product search, cart hold & recall, store-credit tender redemption & customer balance verification, combo component inventory expansion at checkout, audited receipt duplicate reprinting, B2C GST checkout, cash/UPI/card evidence, stock issue, COGS handoff, idempotency, and independent cashier closure with tender-by-tender expected-versus-declared reconciliation across cash, UPI, card, cheque, store credit, customer credit, and other rails. Non-zero variances now have a separate finance maker-checker resolution pack and balanced cashier-variance journal before close approval. POS also exposes a live provider/device readiness boundary for UPI, card, ESC/POS printers, and weighted-SKU scales, with a unified rails-and-devices certification report.
- Counter returns: immutable receipt-line snapshots; serial identity protection; physical inspection to saleable or quarantine stock; independent approval; COGS-reversal handoff; frozen HSN/GST/cess credit evidence; cash-refund custody; provider-refund pending/confirmation; named-customer store-credit issuance & POS redemption; return credit settlement double-entry accounting journal handoffs; and GSTR-1 Table 9B Credit Note workpaper JSON export.
- Retail catalog control: branch-scoped category and subcategory hierarchies, brand masters, item merchandising profiles (rack/bin link, search keywords, encrypted attachment vault product image selector), server-side atomic barcode sequences and reset audit trails, label print run records, retail product combo/bundle/kit definitions with checkout stock expansion.
- Retail catalog operations: weighted-SKU scale profiles with decimal/range guards at POS, certified printer adapter registry with template capability checks, deterministic ESC/POS thermal payload compilation (protocol, byte length, base64 replay evidence, and checksum) plus independent device acknowledgement, maker-checker bulk merchandising edits (up to 500 items), and transactional product/GST/HSN CSV import execution with revision checks and independent maker-checker evidence.
- Retail ecosystem controls: purchase-invoice OCR evidence intake, deterministic India OCR normalization for invoice identity/date/GSTIN/line confidence/taxable value/GST/total drift, certified OCR provider profiles, deterministic confidence/GST/duplicate/mapping/quantity exception scanning, explicit PO-line/SKU mapping, maker-checker review, applied-mapping-bound supplier-invoice conversion with PO/GRN scope checks and three-way-match evidence, credential-fingerprinted marketplace/ONDC connectors, connector-scoped remote SKU mappings with maker-checker retirement, mapping-required remote-order resolution, amount/GST-reconciled remote-order to local sales-order handoff, checksummed catalog/inventory push payloads carrying the remote identity, provider sync runs, idempotent remote-order import, remote confirmation/fulfilment/returns/RTO lifecycle evidence, ONDC conformance cases, order-level settlement allocation packs with fee/refund/TDS-TCS balancing, period-matched TDS/TCS certificate/challan evidence and independent approval before variance resolution, maker-checker conflict-resolution packs for sync failures, duplicate orders, handoff gaps, and settlement queue items, balanced marketplace settlement journal handoff, and return/RTO linkage to approved local inventory plus GST credit-note evidence.
- Procurement & Replenishment: Supplier onboarding, PO, GRN landed-cost capitalisation, supplier 3-way match, automatic reorder point shortfall calculation, GRN landed-cost retail selling margin evaluator, and 1-click retail price book target margin adjustment.
- Customer Loyalty & Promotions: persisted branch-scoped loyalty accounts and points ledger, atomic POS accrual and redemption, tier auto-upgrades (Silver, Gold, Platinum), retail voucher/coupon validation engine (fixed amount, percentage, minimum subtotal, validity window, usage cap, max discount cap), POS checkout loyalty/voucher UI integration, deterministic customer-targeted BOGO promotion evaluation, rack/shelf/category/brand campaign targeting with line-level discount allocation, and governed gift-SKU promotions that verify effective GST/price/stock and issue a zero-price auditable POS line.
- Retail Reporting & Analytics: Client-side computed report engine with X-Report (mid-shift snapshot), Z-Report (shift-close cash reconciliation), Counter Daily Summary (revenue/COGS/margin by date), Category Sales breakdown, Tender Method Breakdown, India GST Summary (CGST/SGST/IGST/Cess by rate), SKU Margin & Sell-Through Report, Campaign Usage/Promotion ROI, Customer Visit Conversion (channel/purpose visits, completed-sale attribution, conversion rate, influenced revenue, and average basket), Returns & Credit Notes readiness (exchange replacement revenue/top-up, GST credit-note status, provider drift, and action queue), Supplier-Invoice OCR readiness (extraction confidence, conversion coverage, mapping backlog, open/critical exceptions, converted value, and provider certification gate), Inter-branch custody readiness (route, stage, in-transit value, pending arrival, dispatch/arrival evidence and journal coverage), Channel Settlement readiness (marketplace/ONDC/website gross, fees, TDS/TCS, variance, allocation, journal, conflict, and external-certification gates), and Retail Payout readiness (unbatched approved commissions, maker-checker batches, release evidence, and production banking certification gate) — all with JSON export.
- Advanced Credit Policy Simulation & Scenarios: Deterministic simulation engine evaluating credit-limit adjustments against payment velocity, DSD, Dunning cases, and risk grades (A, B, C, D, watchlist), stress-testing expected loss rates and working capital impact, with multi-tier approval routing (auto, manager, director, board).
- Payout Workflows & Accounting Integration: Batch payout processing engine with India Income Tax Act TDS withholding calculations (Section 194H, 194Q, 194C, 206AA), net payout computation, and automated double-entry accounting journal draft compilation.
- Provider Adapter Simulation & Conflict Auto-Resolution: Deterministic simulation of remote marketplace, payment gateway, OCR engine, and messaging adapters with automated confidence-based conflict resolution for unmapped SKUs, price drift, tax discrepancies, and duplicate orders.
- Bakaloo-Inspired Visual Quick-Action Hub & Sub-Workbench Polish: Ultra-clean, high-accessibility 6-tile navigation hub (Counter POS, Stock, Returns & Exchanges, Payments, Payouts, Reports) and step-guided sub-workbenches designed for effortless 10-year-old intuitive operation over enterprise-grade business management depth.
- True Retail Command Center: Single-screen store operations deck computing aggregate gross sales, gross margin %, cash variance alerts, stockout risks, expiry liabilities, online order queues, staff performance, and net store profit.
- Omnichannel Inventory Truth & Stock Reservation Engine: Prevents overselling across Counter POS, Website, ONDC, Amazon/Flipkart, and WhatsApp by reserving stock atomically upon order receipt.
- Demand Forecasting & Smart Replenishment: Calculates projected SKU demand considering historical sales velocity, Indian festival multipliers (Diwali, Navratri, Eid, Christmas), supplier lead time, and cash constraints.
- Loss Prevention & Fraud Anomaly Engine: Scans retail transactions to flag suspicious refund frequencies, excessive manual discounts, cashier cash variances, and negative stock override attempts.
- Customer LTV & Consent-Governed WhatsApp Engagement: Calculates customer LTV, RFM (Recency, Frequency, Monetary) metrics, churn risk scores, and generates personalized voucher triggers for consent-governed WhatsApp campaigns.
- Interactive System Certification Panel: Live operational certification audit panel rendering module-by-module readiness scores, automated system verification drill execution, and JSON audit report export.
- Retail Exchanges & Statutory Evidence: approved-return credit converted into a server-priced replacement sale with exact top-up enforcement, source-credit version checks, independent approval, replacement invoice/stock/COGS evidence, remainder store-credit issuance, and provider credit-note reconciliation packs with checksum drift detection.
- Inter-branch Retail Logistics: directional outbound and branch-to-HO transfer requests, independent approval, source dispatch, destination arrival verification, FIFO/batch/serial custody through the inventory engine, inventory-in-transit journal drafts, and explicit dispatch/arrival evidence.

## Provider/device certification reporting

UPI/card production-provider gates, ESC/POS printer acknowledgement gates, weighted-SKU scale controls, blocker counts, evidence references, and next-action classification are now available in the unified Rails & Devices report tab. External certification remains an explicit boundary until real provider or hardware evidence is supplied.

## Partially delivered

## Marketplace / ONDC production certification reporting

The unified Marketplace Gate report now connects production credentials, declared capability conformance, sync response evidence, remote-order handoff gaps, return/RTO evidence, settlement allocation/withholding/journal readiness, and variance exposure. It intentionally remains blocked until real provider credentials and independently assessed production evidence exist.

## Scheduled report delivery readiness

The retail Reports workbench now includes Scheduled Delivery readiness: plan approval, customer-recipient consent gaps, India-time plan state, prepared/handed-off/acknowledged/failed attempts, idempotent handoff evidence, provider certification gates, and explicit next actions. No external message is inferred from a local plan or attempt.

## Unified payout-rail readiness

The retail Reports workbench now includes Payout Rails: banking and payroll connector capability coverage, production credential/conformance gates, pending submission handoffs, reconciliation drift, commission batch release coverage, and payroll run finalization/net-pay coverage. Local records never imply that a bank or payroll provider actually moved funds; real credentials, sandbox evidence, and independent certification remain required.

## OCR adapter certification readiness

OCR provider tests now retain the independent assessor and a deterministic SHA-256 replay checksum. The Reports workbench adds an OCR Adapter Gate that validates credentials, supplier-invoice support, certified status, replay evidence, header/line field coverage, and open exception load separately from ordinary OCR confidence. Older profiles without the new evidence remain explicitly external-certification gated until retested.

## ONDC production conformance readiness

The Reports workbench now adds an ONDC Gate separate from the aggregate marketplace view. It requires production credentials, all four declared retail capabilities (catalog push, inventory push, order pull, settlement pull), scenario-level assessed conformance evidence, acknowledged catalog/inventory pushes, completed order/settlement sync evidence, remote-order handoff and return/RTO evidence, and balanced settlement allocation/withholding/journal closure. Missing provider credentials or production evidence remains an explicit external boundary.

## Capability-pack planning

The Provider Control Plane can now plan an idempotent, connector-scoped conformance pack in one action. It creates one plain-language test case for every declared marketplace or ONDC capability—catalog push, inventory push, order pull, and settlement pull—while preserving existing planned or passed cases. Planning is local preparation only: credentials, real provider responses, checksums, independent assessment, activation, and production certification remain separate evidence gates.

## Provider-certified scheduled delivery

Messaging is now a first-class provider-fabric domain with email-delivery and WhatsApp-delivery capabilities. Scheduled report plans can bind to a messaging connector, and the strict Scheduled Delivery report validates production credentials, channel-specific conformance, plan binding, consent, idempotent attempts, and provider acknowledgements. Unbound plans remain external-certification gated.

## Credit-limit utilisation projection

Collections now exposes per-account INR exposure, approved limit, available headroom, utilisation threshold, overdue grace hold, and the next governed action. The POS uses the same projection to show available customer-credit headroom and disable checkout when the approved policy requires a hold.

## Budget-aware retail replenishment planning

The commerce control plane now contains a Smart Replenishment planner. It derives 30/60/90-day completed counter-sale demand and available stock from governed bin balances, applies an explicit India-season multiplier, calculates SKU-level safety stock and reorder needs, then allocates one shared INR purchase budget to the highest stockout risk first. Deferred quantities, unknown supplier cost, and budget holds remain visible; the planner never creates a purchase order, supplier commitment, or payment automatically.

## Retail loss-prevention watch

The commerce control plane now also surfaces its governed loss-prevention scan: cashier drawer variance, concession discounts above policy, and repeated customer return patterns are visible as review signals with the underlying evidence reference and a plain-language next action. The panel never labels a person fraudulent or resolves an exception automatically.

## Omnichannel reservation-backed fulfilment

Remote marketplace and ONDC orders can now be handed off to a local sales order, confirmed, and reserved against the existing governed stock-position and stock-reservation engine. The commerce workbench captures the dispatch location, reservation identifiers, and evidence reference; fulfilment is blocked until an active reservation exists, while cancellation releases active reservations back to available stock. Provider submission, carrier delivery, and settlement remain explicit external-certification boundaries.

## Offline POS queue and store recovery

The retail counter now has an offline-safe queue for complete checkout payloads. A cashier can save a sale locally with a SHA-256 payload checksum, retry it idempotently, and synchronize it through the same invoice, tender, inventory and COGS boundary used online. Failed recovery becomes an explicit conflict with attempts and reason evidence; an authorized supervisor can requeue or discard it with a stated resolution reason. The POS recovery surface uses the premium blue action system and plain-language controls; it never counts a queued sale as posted revenue.

The POS recovery surface now also offers a bounded background synchronization pass for the active cashier. It processes up to 50 queued sales in order, reuses the canonical checkout boundary for each item, skips other cashiers' queues, and continues after a failed item by retaining that item as an explicit conflict. This gives stores a practical reconnect action without weakening cashier ownership, idempotency, or recovery evidence.

Before a recovered queue item can enter checkout, Epic BOS recomputes its payload checksum and compares it with the persisted evidence. A mismatch is recorded as a synchronization conflict with an incremented attempt and no sale, inventory, tender, or COGS posting. This protects offline sales after a partial write, restore, or local tampering event; a supervisor must explicitly review and requeue or discard the item.

## Physical device transport evidence

Counter hardware now shares one transport contract for barcode scanners, ESC/POS printers, cash drawers and weighing scales. Commands are prepared with device kind, connection, payload byte length and SHA-256 checksum; only an independent operator can record an acknowledgement or failure response. The transport ledger is an evidence boundary and does not claim USB, network or Bluetooth success until a real device response is supplied.

Failed device commands now have a governed recovery path. A different operator can enter a replacement payload and an authorisation reason to create a linked retry command; the original failure remains immutable, a prepared command is still subject to independent acknowledgement, and a device with another prepared command cannot be retried concurrently. This prevents silent hardware replay while keeping store recovery practical after disconnects or timeouts.

Device response evidence is now single-use within the branch scope. An acknowledgement or failure cannot reuse a response reference or response checksum already attached to another command; a suspected replay stays outside the acknowledged state and requires a fresh device response. This protects scanner, printer, drawer, and scale certification evidence from copied responses across retries.

Physical-device acknowledgements now also carry a protocol envelope and observed response byte length. Barcode scanners, ESC/POS printers, cash drawers, and weighing scales each have a distinct response protocol identifier; a mismatched protocol or zero-length successful response is rejected before the command becomes acknowledged. The envelope is evidence metadata, not a claim that the selected hardware protocol has been externally certified.

The Physical Device Transport panel now includes a bounded network connectivity preflight. It can send an operator-supplied test payload through a short-lived TCP socket and returns response checksum, byte count, latency, and a safe reference; USB, Bluetooth, and manual connections remain explicitly driver-gated. Each result is persisted with actor, timestamp, branch scope, and version for restart-safe review. Preflight is diagnostic evidence only and never changes a prepared command to acknowledged or claims production hardware certification.

The same panel now offers a user-initiated Web Serial diagnostic for USB-attached serial adapters (common scanner, printer, scale and drawer bridges). Electron allows only the trusted Epic BOS origin, refuses to guess when more than one serial port is present, opens the selected port at a bounded baud rate, sends a bounded test payload, captures at most 64 KB of response, closes the port, and persists checksum-only evidence through the authenticated bridge. Missing Web Serial support, picker cancellation, driver errors, and ambiguous ports remain explicit non-certified outcomes; this does not replace device-specific protocol testing or provider certification.

## Provider pull/push response evidence

Marketplace, ONDC, and website sync runs now require the assessed provider response checksum and positive response byte length before a completed or completed-with-exceptions result can be recorded. The workbench captures the provider reference, evidence reference, observed read/accepted/rejected counts, and remote cursor; the maker cannot certify its own run. Failed runs may record a failure evidence reference without pretending a provider payload was received, and configured connectors are not promoted to certified on failure.

Certified commerce connectors now also have a bounded main-process HTTPS execution seam. It accepts only same-origin relative paths, uses the encrypted connector vault, sends the prepared request checksum as an idempotency key, hashes the exact response bytes, and accepts only the canonical response envelope. Arbitrary 2xx payloads remain unprocessed rather than becoming false sync success. Canonical order-pull responses can optionally import mapped orders; each local mapping/import failure is retained as a completed-with-exceptions outcome rather than inventing an order. Canonical settlement-pull responses can optionally create settlement reconciliations; local net is derived only from known Epic BOS orders and any variance remains reviewable. When every settlement order is known and amounts can balance, an order-level allocation pack is drafted automatically for independent approval; it never auto-resolves the settlement.

An approved retry conflict resolution now creates a fresh prepared sync run with a new idempotency checksum and the approving operator as maker. The provider is never called automatically by the approval itself; a separate execution and independent response certification remain required, preventing a failed provider call from being silently replayed or counted twice.

Channel conflict-resolution packs now snapshot the source provider/request checksum. Duplicate-order, handoff, return/RTO, and settlement conflicts cannot even be prepared without that checksum, and approval rechecks it against the current order, sync run, or settlement. If the source evidence changes while a pack is awaiting review, the pack is rejected as stale and a new independent disposition is required.

The provider workbench now exposes evidence-entry forms for push delivery and ONDC/marketplace conformance results instead of dead-end sample buttons. Operators must enter the real provider reference, outcome, evidence reference, and result checksum; built-in sample evidence continues to be rejected at the domain boundary.

Channel health now detects repeated successful pull cursors per connector and sync kind. A reused cursor is surfaced as a high-severity `sync-cursor-replay` conflict with the affected run, connector, and a plain-language checksum/retry action; it can use the existing maker-checker resolution path. This is deliberately review-first because a repeated cursor can be either a provider no-op or an adapter replay, and Epic BOS does not silently treat it as a fresh page.

Marketplace settlement imports now carry aggregate provider refund/RTO deductions all the way into the settlement record, INR readiness report, and accounting draft. Net is calculated as gross less refunds, fees, and TDS/TCS; the refund amount is shown beside gross, fees, and variance in the Reports workbench. When a provider reports aggregate refunds, automatic order allocation is intentionally withheld until an operator supplies and independently approves the order-level refund allocation, while the balanced journal records a `sales-returns` debit. This prevents RTO/refund value from disappearing into an unexplained settlement variance.

Settlement allocation approval now reconciles every aggregate against authoritative provider evidence, including gross, refund/RTO, fees, withholding, and net. An RTO or returned order cannot be financially closed through an allocation pack that hides or misstates the provider refund; the independent approver receives an explicit mismatch instead of a false settlement closure.

Commission payout release now has the same settlement boundary: every commission in an approved batch must point to a completed sale with branch-scoped payment receipts, matching retail-sale identity, and `reconciled` receipt status. Missing, reversed, mismatched, or merely recorded receipts block treasury release with an explicit evidence error; local approval never implies that a bank, UPI, card, or marketplace provider moved funds.

Marketplace/ONDC settlement closure now also checks the lifecycle of every explicitly linked remote order. Resolution and journal handoff require terminal, evidenced order status; returned/RTO orders additionally require the approved return, GST credit-note, and inventory-receipt evidence. A settlement cannot become financially posted merely because its aggregate gross, fees, withholding, refunds, and net happen to balance while an order remains imported or confirmed.

The Channel Settlements report now presents a unified payout-exception queue across marketplace, ONDC, website, and WhatsApp connectors. Each exception retains settlement number/reference, connector/channel, severity, INR exposure, and a concrete next action for provider variance, open order closure, missing allocation, TDS/TCS evidence, journal handoff, conflict resolution, or external certification. The renderer includes linked remote orders in this report so a balanced payout with an open order remains visibly blocked instead of disappearing into connector totals.

Demand intelligence now reconciles expiry-safe stock and open inbound purchase quantities before recommending replenishment. Forecasts expose physical stock, expiry-risk units, supplier inbound, net coverage, stockout days, and INR budget deferrals; near-expiry units are removed from coverage and inbound quantities reduce duplicate buying. The planner uses India festival multipliers, supplier lead time, and shared INR funding while remaining recommendation-only until a governed requisition is approved.

Conformance cases now identify the exact declared connector capability they exercise. Certification requires independently evidenced passes for every declared capability; duplicate cases cannot inflate coverage, and legacy multi-capability cases remain external-certification gated until retested.

The Release workspace can export a redacted, checksummed retail certification pack from the current scoped state. It consolidates connector capability gaps, device command outcomes, OCR provider readiness, external-gate count, and production-readiness status; no credentials or secret payloads are included.

The same pack now includes generic banking, payroll, messaging, and statutory connectors. Generic conformance cases carry their exercised capability, activation requires independent passes for all declared capabilities, and unresolved provider handoffs remain visible as external gates.

The exported pack now also carries redacted provider connectivity-preflight history per connector: successful and failed diagnostic counts, latest status/time, and evidence references. These diagnostics improve sandbox readiness review but never promote a connector or reduce the external certification gate.

The settlement workbench now exposes the existing balanced marketplace journal handoff instead of leaving it as a hidden backend action. Matched or independently resolved settlements can prepare one checksum-identified accounting draft; Finance still posts that draft through the canonical ledger, and missing provider evidence never becomes a posted journal.

The commerce workbench now also shows a live, read-only certification matrix: commerce connectors, banking/payroll/statutory/messaging adapters, device evidence, open submissions, capability gaps, and preflight history. It uses the same checksummed pack as Release, so operators can see the exact next action beside an ONDC, Marketplace, Website, or WhatsApp connector without confusing local readiness with external acceptance.

Renderer copy was also normalized across delivery, bank-import, and marketplace screens so Indian rupee, arrows, apostrophes, and range separators render as readable Unicode rather than mojibake. This is a presentation-only cleanup; no financial or provider evidence is changed.

## Generic provider response evidence

Banking, payroll, messaging, and statutory handoffs now require a real external response outcome and SHA-256 response payload evidence before an acknowledgement or failure is recorded. Acknowledgements require an external reference; failures require a provider error message. Response reconciliation also rejects the same operator who released the handoff; missing provider evidence remains pending rather than becoming local success.

Marketplace, ONDC, and website connectors can now seal real client/API/bearer/signing material through the encrypted main-process provider vault. The renderer receives and displays only an integrity checksum; a fingerprint-only certification path remains available for provider packs that are awaiting credentials. Secret material is never written to the RevenueOps snapshot.

## Diagnostic provider connectivity preflight

Active provider connectors now have a bounded diagnostic preflight in the main process. An operator can run one GET health/status request or one POST JSON-object test against a same-origin HTTPS path using vaulted credentials. The request checksum, response checksum, HTTP status, response byte length, evidence reference, actor, and timestamp are persisted without retaining provider payloads or secrets. HTTP failures and transport errors remain failed evidence, while connector activation, conformance, handoffs, and production approval are unchanged. A connector-version check prevents a preflight from running against stale configuration. This is a safe sandbox verification aid, not external certification.

## OCR provider maker-checker boundary

An OCR provider profile creator cannot assess the same provider certification test. A separate operator must supply the replay evidence before the profile becomes certified and eligible for supplier-invoice intake.

Built-in all-`a` checksums and sample OCR/push/conformance evidence are rejected at the domain boundary, so a local demo click cannot promote an external provider to certified or acknowledged.

Certified API OCR profiles can now bind a credential-free HTTPS origin and seal client/API/bearer/signing material through the encrypted provider vault. The main process accepts only the canonical OCR extraction envelope, hashes the exact response, and creates a normal review-state supplier-invoice document with provider evidence. Missing provider credentials, non-canonical payloads, failed responses, and unassessed profiles remain blocked.

## Marketplace mapping maker-checker boundary

Remote SKU mappings are prepared first and cannot resolve marketplace/ONDC orders or drive catalog and inventory pushes until an independent operator approves them with evidence. Rejected mappings remain non-resolvable, and every decision records the reviewer, decision time, expected version, and evidence reference.

## Shipment RMA inspection and disposition

Shipment returns are now distinct from counter returns through a four-step lifecycle: delivered-package authorization, independent approval, physical receipt into an inspection-pending state, and independent disposition. Restock closes the RMA without changing the received quantity; quarantine, scrap, and return-to-vendor dispositions post controlled adjustment-out evidence so failed goods cannot remain saleable.

| Area | Current boundary | Remaining retail work |
| --- | --- | --- |
| Company master | Legal entity and governed India profile now carry registered address, state/PIN, contact, HTTPS website, GSTIN, PAN, encrypted-logo attachment reference, and an active scoped primary bank account used in masked invoice payment instructions with optimistic versioning and audit evidence | Bank-provider certification and live external settlement rails |
| Catalog | SKU, UOM, variant, barcode, GST, categories, brands, merchandising profiles, rack bin links, barcode sequence, label runs, product combos/bundles, attachment vault product image selector, scale profiles, printer adapter evidence, governed bulk edits, strict product/GST/HSN CSV validation and transactional execution, OCR provider profiles and catalog/inventory push payloads | Provider-specific extraction accuracy, external device certification, production marketplace mapping |
| Pricing | Quantity tiers, ordinary discounts, retail price books, inclusive/exclusive GST, retail vouchers & coupon discount validation engine, customer-targeted BOGO pricing evaluation, persisted loyalty accounts, rack/bin/category/brand campaigns with targeted GST-safe allocation, governed gift-SKU fulfilment, and immutable campaign-redemption evidence | Advanced credit policy simulation and payout integrations |
| POS | B2C and registered B2B counter flow with GSTIN/state-aware tax treatment, cashier custody, touch category/brand filters, hold/recall cart, store-credit tender redemption, audited receipt reprinting, loyalty points redemption & voucher apply card, weighted-SKU precision/range validation, independent cashier close, tender-by-tender reconciliation with variance blocking, and approved variance-resolution journals | Live USB/network/Bluetooth transport and thermal hardware certification |
| Counter returns | Receipt return, inspection, stock re-entry/quarantine, GST/cess credit basis, cash/provider/store-credit settlement, POS store-credit redemption, COGS handoff, settlement journal handoffs, GSTR-1 Table 9B workpaper export, replacement exchange checkout, remainder credit, credit-note reconciliation evidence | Provider-specific statutory filing certification |
| Customers | Party Master, AR, selected B2C customer identity, persisted loyalty accounts, atomic points accrual/redemption, tier progression (Silver/Gold/Platinum), branch-scoped POS visit capture, governed visit-to-sale attribution, approved credit-at-counter checkout, credit-limit utilisation and overdue-grace projection, consent-governed communication purpose/delivery evidence, and commission records with independent approval plus controlled maker-checker-release payout batches | Provider adapters |
| Procurement | Supplier, PO, GRN, three-way match, landed cost, automated reorder proposal calculation, GRN landed-cost retail margin evaluator & price list target margin adjustment, OCR intake/review, deterministic India extraction normalization, certified provider profile, PO-line/SKU mapping, deterministic exception queue and conversion seam | Provider-specific adapter accuracy certification |
| Transfers | Controlled warehouse transfers plus directional inter-branch/branch-to-HO requests, dispatch scans, arrival verification, transfer accounting, route/stage readiness, in-transit valuation, and evidence/journal coverage reporting | Physical carrier/device certification and multi-tenant branch network rollout |
| Ecosystem | OCR intake/mapping, applied-mapping-bound supplier-invoice conversion, connector-scoped marketplace/ONDC SKU identity registry, mapping-required catalog/inventory push and remote-order import, amount/GST-reconciled local sales-order handoff, order-level settlement allocation packs, period-matched TDS/TCS certificate/challan evidence, maker-checker channel conflict resolution, remote order lifecycle, returns/RTO bridge, ONDC conformance queue, settlement reconciliation, and deterministic connector/sync/order/settlement conflict queue | Provider pull/push certification, production mapping confirmation, and external credentials |
| Reporting | Finance, demand, stock, reorder, executive dashboards, X/Z, counter/cashier/tender/category/tax/margin/sell-through retail reports, campaign usage/ROI analytics, customer visit-to-sale conversion analytics, exchange and GST credit-note readiness, supplier-invoice OCR confidence/mapping/exception readiness, inter-branch custody route/stage/in-transit readiness, marketplace/ONDC/website settlement readiness, commission payout readiness with bank certification boundary, team payout analytics, controlled commission batch status, customer credit-limit utilisation, batch expiry risk, rack/bin readiness, consented scheduled report plans, idempotent India-time handoffs, provider result evidence and JSON exports | Provider-certified scheduled delivery |

## Retail command centre

The Command workspace now includes a live retail operations panel computed from the governed RevenueOps snapshot: INR gross sales, known gross profit and margin, store performance, cash variance, stockout and expiry attention, plus the count and INR exposure of imported/confirmed omnichannel orders awaiting fulfilment. The queue is now broken down by marketplace, ONDC, website, and WhatsApp so a manager can see channel demand without opening separate systems. Profit and margin use only sales with recorded cost evidence and expose cost coverage; missing cost is never estimated. It is an operational read surface only; it does not invent transactions or treat external orders as fulfilled.

## Margin protection and loss-prevention intelligence

The loss-prevention scan now adds a deterministic post-discount margin-erosion signal. Each completed sale is checked against a configurable protected margin floor (10% by default) using only its recorded subtotal, discount total, and cost evidence. Below-floor sales carry the calculated INR contribution shortfall, severity (medium/high/critical, with negative margin critical), cashier/counter ownership, and source-sale evidence. The retail safeguards panel labels the signal and gives a concrete review action; it never blocks or alters a completed sale and never treats a review signal as a fraud finding.

## Retail command-centre priority queue

The Command workspace now exposes one ranked, blue-toned action queue for store managers. It combines unresolved cashier variance, post-discount margin erosion, counter-bin stockouts, released batches expiring within 30 days, and imported/confirmed omnichannel orders. Each row carries a deterministic priority score, severity, count, INR exposure where available, evidence-backed summary, and a plain-language next action. The queue is an operational read surface: it does not invent profit, reserve inventory, close a drawer, or treat an imported online order as fulfilled.

## Offline store recovery handoff

Offline POS synchronization now supports an independent supervisor recovery pass after a power or network failure. The original cashier session remains the normal path; a different actor must provide a bounded recovery-evidence reference before the queue item can be attempted. Every recovery attempt persists the actor, mode, evidence reference, attempt count, and resulting conflict/sync status. The POS exposes a separate “Resume another cashier’s saved sales” action, while all normal checkout, stock, GST, payment, checksum, and conflict gates still apply.

## Provider cursor checkpoints

Marketplace, ONDC, website, and WhatsApp sync runs now maintain a connector-scoped cursor checkpoint with the sync kind and source run. A completed provider response cannot advance the checkpoint when its cursor exactly replays the previous token or numerically moves backwards; the run remains available for an explicit cursor-conflict review/retry. Accepted cursor evidence is stored with the connector and is separate from provider certification, settlement posting, or order fulfilment. Opaque provider tokens are protected against exact replay; numeric tokens additionally require strict forward movement.

## Unified channel conflict outcomes

Approved channel conflict decisions now write their disposition back to the exact source record: sync run, remote order, or settlement reconciliation. The source stores the resolution pack ID, accepted/waived/retry decision, independent approver, timestamp, and decision evidence. The Provider Control Plane exposes a resolved-outcomes register alongside the live conflict queue, so an approved settlement exception or order decision remains auditable without being confused with fulfilment, GST credit-note completion, or accounting posting.

## Marketplace payout and RTO reconciliation

The Provider Control Plane now exposes a read-only payout-close projection per marketplace/ONDC settlement. It joins provider gross payout, refund deductions, marketplace commission/fee, withholding and net payout to the approved order allocation pack, then classifies every linked order as fulfilled, cancelled, returned, RTO, or open. RTO and customer-return refunds are shown separately, while missing terminal status, GST credit-note, inventory receipt, allocation coverage, or payout variance remain explicit next actions. A balanced provider payout is never treated as closed until the linked order evidence is complete; no bank transfer, provider refund, or statutory filing is inferred from local calculations.

## Store execution readiness

The physical-device workbench now projects one store-control view across the offline POS queue and barcode scanner, ESC/POS printer, cash drawer, and weighing-scale evidence. It counts queued/syncing/conflicted offline sales, supervisor recovery attempts, prepared versus acknowledged/failed hardware commands, and reachable/failed diagnostics, then assigns each device a plain-language next action. A reachable preflight remains diagnostic only; only an independently evidenced response is an acknowledgement, and offline sales remain non-posting until the normal checkout boundary succeeds.

## Electronic tender settlement reconciliation

Cash Health now includes a separate INR electronic-tender settlement projection for UPI, card, and bank-transfer receipts. It joins recorded/reconciled payment receipts to matched imported bank lines, shows recorded versus bank-matched amounts and the remaining gap by method, and keeps cash drawer evidence out of the electronic rail. Missing bank lines remain actionable with a direct route to the bank-matching desk; a recorded receipt or local provider label is never treated as an independently settled UPI/card transaction.

## UPI / card provider settlement evidence

Banking conformance cases now carry an explicit payment-rail tag (`upi`, `card`, or `bank-transfer`). The payout-rail report joins independently assessed production evidence to provider reconciliation pulls and the electronic tender bank-match projection. Each rail is separately shown as ready, missing provider evidence, missing a settlement pull, carrying reconciliation exceptions, or awaiting bank matching. Rail names are never inferred from connector labels, and local receipts remain distinct from external settlement certification.

## OCR document-kind certification

OCR provider profiles now retain explicit independent replay evidence per declared document kind. The readiness workbench exposes a document-kind matrix for supplier invoices, credit notes, and debit notes, including assessor, timestamp, evidence reference, and checksum-backed readiness. Aggregate legacy test fields remain visible but cannot close a newly declared kind-level gate.

## ONDC capability evidence

ONDC production readiness now requires each capability conformance case to carry the explicit declared capability (`catalog-push`, `inventory-push`, `order-pull`, or `settlement-pull`). Scenario wording is no longer interpreted as capability evidence. Missing declared capabilities and missing capability-specific evidence remain separate, visible gates; sandbox credentials or local sync records never imply production certification.

## Scheduled delivery provider evidence

Messaging conformance cases now carry an explicit delivery-channel tag (`email` or `whatsapp`) alongside the declared capability. Scheduled report readiness requires a production messaging connector, configured credentials, approved conformance, a matching capability/channel case with independent evidence and checksum, and an acknowledged delivery attempt. Scenario wording, a prepared handoff, or a local report export never counts as a delivered message.

## Provider capability-pack planning

The Provider Fabric now plans an idempotent conformance pack for every declared provider capability. Messaging cases are explicitly tagged as email or WhatsApp and include delivery, opt-out, template/DLT, failure, and acknowledgement scenarios; banking, payroll, and statutory connectors receive their corresponding response and reconciliation scenarios. Planning creates local test records only—credentials, real provider responses, independent assessment, activation, and production delivery remain separate gates.

## Messaging handoff source validation

Provider submission preparation for email and WhatsApp now requires real report-delivery attempt IDs from the active company and branch. Each attempt must still be prepared, reference an approved plan, match the declared channel, retain affirmative customer-consent evidence, and either be unbound or explicitly bound to the selected messaging connector. Reusing an attempt in another prepared or handed-off submission, using an acknowledged/failed attempt, crossing branch scope, or supplying an arbitrary ID is rejected before a provider packet is created. This closes the local handoff boundary without claiming that an external message was delivered; provider acknowledgement and production certification remain independent gates.

## Marketplace settlement order-membership gate

Settlement-pull execution now refuses to create a partial settlement when the provider response references an unknown, cross-branch, or duplicate remote order. The settlement record is not posted; the sync is marked completed-with-exceptions and enters the existing independent conflict queue so operators can import the missing order page and retry with a fresh provider response. This prevents a payout from appearing balanced while silently omitting an order from allocation, refund/RTO review, GST evidence, or journal preparation.

## Settlement allocation completeness gate

Order-level settlement allocation packs now require the exact provider-linked order set: no omitted order, unrelated local order, or manually introduced membership is accepted. Allocation approval also requires every linked order to have a terminal, evidenced lifecycle, including return/RTO, GST credit-note, and inventory evidence where applicable. Aggregate settlements with no provider order membership cannot be allocated to arbitrary local orders; they remain governed by aggregate settlement and journal evidence only.

## Retail production exit gate

The Reports workbench now composes offline POS recovery, counter-device/payment evidence, marketplace, ONDC, and scheduled-delivery projections into one go/hold gate. Local queue/device blockers are separated from external-certification gates, and a green local projection never substitutes for provider credentials, sandbox/production evidence, or physical-device acknowledgement.

## Retail rollout readiness

The Reports workbench now adds a runtime rollout projection over the retail exit gate, database/audit/migration health, event-outbox drain, and main-process observability. A local GO requires the health snapshot to be available and clear; pending or failed outbox work holds rollout. External provider/device certification remains a separate hold reason and is never converted into local readiness.

## Cross-platform artifact readiness

Control Room release evidence now exposes separate Windows, macOS, and Linux artifact rows. The matrix does not infer a second platform from the current runtime: each row requires its own package gate, artifact SHA-256, smoke-test evidence, signing evidence, and (for macOS) notarisation evidence. The existing Windows executable is a local package artifact; code signing, notarisation, and native macOS/Linux builds remain explicit release work.

## Cross-platform artifact evidence capture

Release operations now persist one immutable artifact-evidence record per platform and version. A submission carries the artifact reference, exact SHA-256, clean install/launch smoke-test reference, signing reference, and (for macOS) Apple notarisation reference. Submissions remain `submitted` until a different release operator independently verifies or rejects them; the maker cannot certify their own artifact. The release matrix surfaces submitted evidence but only independently verified evidence can move a platform toward a release-ready state. Duplicate platform/version submissions are rejected so release history cannot be silently overwritten.

## Automatic update and rollback readiness

Control Room now has a persisted update-channel evidence register for Stable and Beta releases across Windows, macOS, and Linux. Each candidate records the current version, strictly forward target version, rollback version, manifest reference and SHA-256, signing attestation, and rollback-drill reference. A different release operator must verify or reject the submission; duplicate channel/platform/target combinations cannot overwrite history. The readiness projection keeps malformed manifests, stale version progression, missing rollback evidence, missing platform artifacts, rejected evidence, and unverified submissions on hold. A verified local record still does not create an update server, signing key, notarisation ticket, or provider certification; those remain explicit external release gates.

## Deployment promotion checklist

Control Room now composes one promotion packet from core release gates, the cross-platform artifact matrix, Stable/Beta update-channel readiness, runtime database/audit/migration health, and pending/failed event-outbox recovery. The packet reports `go` only when all local checks are clear; platform signing, notarisation, provider/device credentials, and marketplace/GSP/IRP certification remain visible as external gates. Operators can copy the deterministic JSON packet for a change ticket or rollout review, while the app never claims that a package build alone is a production deployment.

## Electronic tender and commission payout posting gate

Bank statement matching now carries the active company/branch scope onto every imported statement and line. Confirmation accepts only a committed positive bank credit, rejects debit rows, cash/store-credit receipts, cross-scope evidence, duplicate matches, stale records, maker self-approval, seven-day date drift, and mismatched UPI/card/bank-clearing accounts. A local receipt is therefore not marked reconciled merely because its amount appears in a CSV.

Released retail commission payout batches now create one balanced, checksum-backed `retail-commission-payout` journal handoff atomically with the paid status. The handoff debits `employee-expense`, credits `cash-at-bank`, retains the bank release reference, and is linked from the batch. Finance can now prepare this handoff through a dedicated scope-checked, checksum-checked, open-period and replay-safe canonical ledger route; the separate maker/checker post step remains required before it becomes an immutable posted journal.

## Omnichannel physical-lifecycle gate

Remote marketplace, ONDC, website and WhatsApp orders now treat local stock custody as part of their lifecycle. A remote order cannot be marked fulfilled while any reservation is still only `reserved`; every reservation must be packed or issued. A provider cancellation is rejected after a reservation is packed or issued, directing the operator into the return/RTO workflow so packed stock is never silently stranded or released twice. Pre-pack cancellations continue to release every active reservation atomically.

## Provider certification boundary

Successful marketplace, ONDC, website, or WhatsApp sync responses update the connector cursor and sync evidence but never certify the connector. Certification remains an independent, capability-complete conformance decision with configured credentials and assessed provider evidence. This prevents a reachable endpoint or a single successful pull from being mistaken for production certification.

## Live order-status reconciliation

Canonical order pulls may now carry a provider lifecycle status. The status is stored with its own checksum and evidence while the governed local status, reservations, GST, and return records remain untouched. A terminal provider/local divergence (for example, provider `cancelled` while local stock is still `imported`, or provider `fulfilled` before local stock is issued) appears as a critical `order-status-conflict` in channel health and can be routed through the existing independent conflict-resolution workflow.

## Live catalog and inventory push acknowledgement gate

Prepared catalog and inventory batches are now executable through the configured, credential-vaulted commerce connector. The provider response is accepted only when it is canonical JSON, explicitly reports `acknowledged`, repeats the exact prepared payload SHA-256, and confirms acceptance of every prepared SKU record. HTTP failures, malformed responses, partial record counts, or a different payload checksum remain failed/exception evidence and cannot advance a batch as successful. Response SHA-256, byte length, provider reference, and evidence reference are persisted with the batch so a later operator can replay the exact acknowledgement. Manual evidence capture uses the same checksum and response metadata fields; it never substitutes a fabricated provider acknowledgement.

## Network device command execution gate

Network commands can be prepared only from a current `approved` or `operational` device profile. The command retains that exact profile ID and version; its reviewed host and port come from the profile rather than a renderer field. A different operator supplies the exact prepared payload and a bounded timeout, and a non-empty TCP response is recorded with the device-specific protocol, response checksum, byte length, and TCP reference. A legacy/unbound command, stale/revoked profile, endpoint mismatch, timeout, empty response, payload mismatch, or non-network connection remains a failed or re-preparation state. The workbench presents one locked `Reviewed endpoint` instead of editable host and port fields, and manual acknowledgement cannot activate a network device. USB, Bluetooth, and manual connections remain explicitly driver-gated, and network reachability alone never becomes certification.

## Aggregate settlement refund/RTO proposal gate

Settlement execution now creates a prepared allocation proposal when the authoritative provider order set is complete and its aggregate refund can be explained by returned/RTO orders. Gross, commission, withholding, and refund amounts are distributed deterministically with cent-level balancing; the proposal is checksummed and remains a maker/checker review item. If the order set is incomplete, the refund has no returned/RTO evidence, or any allocation would exceed the linked order, no proposal is created and the payout remains an explicit exception for manual reconciliation. Approval still requires terminal lifecycle, GST credit-note, inventory receipt, withholding, and journal gates.

## Demand trend and confidence evidence

The smart replenishment planner now shows the recent 30-day velocity trend against the 90-day baseline (`rising`, `stable`, or `falling`) and a plain-language history confidence (`high`, `medium`, or `low`). Trend and confidence are derived only from completed sale quantities, while the existing festival, expiry-safe stock, inbound, lead-time, and INR-budget controls remain unchanged. This prevents a store manager from reading a sparse or declining history as a precise surge forecast; recommendations remain advisory and cannot create a purchase order or price change automatically.

## Unified omnichannel order desk

The commerce workbench now includes one plain-language order desk across marketplace, ONDC, website, and WhatsApp channels. It groups channel demand and open INR value, filters by channel, and ranks each order by evidence-backed urgency. Provider/local lifecycle conflicts, missing local sales-order handoffs, unreserved stock, fulfilled orders whose stock is still only reserved, and incomplete return/RTO bridges are shown as explicit next actions. Packed reservations are distinguished from merely reserved stock. This is a read projection only: handoff, reservation, fulfilment, return, and conflict decisions continue through the existing governed controls and no remote status is allowed to overwrite local custody.

## Certification evidence freshness

Production commerce connectors, API OCR providers, and active production provider capabilities now use a deterministic 90-day evidence policy. Independently assessed, checksummed evidence is shown as `current`, `renewal due` after 60 days, `expired` after 90 days, or `missing`. The Reports workbench exposes a plain-language renewal watch beside the production exit gate, and the certification pack no longer calls expired capability evidence ready. Expired or missing evidence holds the production gate; renewal-due evidence requires action before rollout. This is a local governance control only: selected GSP/IRP, bank, messaging, ONDC/marketplace, device, and portal providers must still supply real credentials and independently certify real submissions.

## Credential-generation certification binding

Changing a sealed provider, marketplace/ONDC, or API OCR credential now creates a new credential generation. The rotation clears the relevant local approval state, and every provider conformance case, commerce conformance case, OCR document-kind replay, provider submission, readiness projection, freshness report, and certification pack is evaluated against that generation. Earlier evidence remains preserved for audit and recovery, but cannot satisfy the current production gate or be handed off after the credential changes. This prevents a previous secret's approval from being silently reused after a rotation.

## Truthful go-live checklist

The Reports workbench now presents a plain-language `Go-live checklist` rather than a static percentage or simulated drill. Its decision, local actions, external approvals, runtime rollout checks, retail execution checks, and current-credential evidence are all derived from the live readiness projections. Copying the checklist exports the actual evidence packet for a rollout review; it does not create a restore drill, provider approval, device certification, or production claim.

## Screen and role acceptance ledger

Epic BOS now carries a persistent 48-journey acceptance catalog across cashier, store manager, HQ/finance, and administrator roles. Each check is recorded against both the current `releaseIdentitySha256` and the exact scenario revision fingerprint. A release change or a changed journey makes earlier evidence stale instead of silently passing a new build. The person who recorded a check cannot verify it; a different authenticated reviewer must independently verify it. The release-deployment projection therefore holds the release until all in-scope journeys for the active build are independently verified. The control-room screen uses simple role tabs, one clear scenario choice, one evidence field, and a visible review queue. It reports missing and stale checks honestly; recording a checkbox does not claim every screen is certified.

## Offline conflict recovery maker-checker boundary

Offline conflict resolution now has the same separation as cash closure. The cashier who queued an offline sale can see its reason but cannot requeue or discard it. A different supervisor must enter a bounded recovery-evidence reference before either decision becomes available. That reference, actor, reason, timestamp, and expected version are retained with the conflict outcome. The POS UI calls this out in plain language, and the main-process schema and domain boundary both require the reference, so a stale or handcrafted renderer request cannot bypass the rule. Requeue remains a normal governed checkout retry; discard is not a refund, inventory adjustment, or settlement outcome.

## Release identity-bound platform evidence

Windows, macOS, and Linux artifact and update evidence is tied to the active release identity rather than a version label alone. A source/build/schema change therefore needs new independently reviewed platform evidence. The repository includes `RELEASE_RUNBOOK.md` and `STORE_RECOVERY_RUNBOOK.md` for clean-install, signing, notarisation, update, monitoring, store-recovery, and backup/restore procedures. Configured package makers are not a claim that a macOS/Linux build has been created, signed, or tested; those remain explicit target-platform gates.

## Next retail waves

The Retail Hub now has a strict, versioned shadow-import JSON ingestion seam.
It accepts only Bakaloo evidence, rejects credential-like fields, builds and
registers checksummed `shadow-read-only` review plans, and has no filesystem,
network, or write-back behavior.

The Electron command centre now exposes a matching preview-only import review
surface. Operators can inspect a local JSON export's batch, cursor, entity
counts, and declared checksum before Hub verification; the UI has no import,
sync, or write-back action.

The Hub also exposes a PostgreSQL repository seam and migration definition for
durable shadow evidence. Reads and upserts require explicit tenant, company,
and branch scope; the adapter is injected and does not claim that a database,
pool, migration runner, or live connector exists yet.

The durable Hub service now binds that repository to the same read-only HTTP
resources asynchronously. It requires a trusted server-side scope resolver,
returns `403` when scope is absent, and continues to reject every write verb;
no renderer-provided scope or live provider connection is accepted as proof.

The retail Customers route now opens a simple Customer 360 surface backed by
the governed party, sale, loyalty, visit, consent, and address snapshots. It
supports local search and selection, shows INR purchase history and explicit
consent state, and keeps mutations behind the advanced CRM controls.

The retail Deliver route now opens a focused Orders-to-pack queue before the
large fulfilment workbench. It reuses the existing omnichannel evidence
projection to show open demand, attention blockers, packed-stock evidence,
channel/status filters, INR values, and one selected-order next step. The
front door is read-only and clearly states that provider/Bakaloo writes remain
behind the governed fulfilment controls; no ETA, map pin, or fabricated order
activity is shown.

The retail Stock route now opens a focused inventory overview before the large
warehouse workbench. It derives tracked variants, available and reserved
units, active reorder-policy risk, expired batches, and open warehouse tasks
from local records only. Replenishment, quarantine, and stock adjustments stay
behind governed controls; an empty workspace remains visibly empty instead of
showing sample quantities.

The retail Money route now opens a focused cash-control view before the larger
finance workbench. It derives till status, sales and tender totals, close
requests, declared/expected cash, variance evidence, and unreconciled receipt
counts from local records only. Closing, variance approval, and payment
reconciliation remain maker-checker actions in the governed controls; no cash
balance or settlement is invented for an empty workspace.

The retail Insights route now opens a visual, source-linked decision brief
before the detailed intelligence workbench. It shows billed product bars,
stock/fulfilment/collections queue counts, and only real exception rows from
the existing commerce-insights projection. Empty workspaces show a quiet
empty-state chart rather than a fabricated trend; forecasts and actions remain
behind the detailed intelligence controls.

The retail Sell route now opens a focused POS front door before the full POS
workbench. It shows active counters, open shifts, completed receipts, average
basket, recent sale/tender evidence, and a plain-language counter checklist.
Starting a sale remains an explicit handoff into the governed POS path, where
GST, stock, tender, receipt, offline queue, and loyalty writes are controlled.

General provider integration readiness now binds conformance evidence to the
connector's credential revision. When a provider secret rotates, previously
passed cases are excluded from current evidence, reported as stale, and the
connector remains blocked until the cases are replayed with the active
credential generation. The assessment also reports the active revision for
auditable certification packs.

The ecosystem activation matrix displays that active revision and stale-case
count, so operators can see why a rotated provider is blocked without
mistaking old evidence for current approval.

1. Provider-specific OCR adapters and production extraction certification.
2. ONDC production conformance and provider settlement certification with real credentials.
3. Provider-certified scheduled delivery once messaging credentials, production approval, and channel conformance evidence are supplied.
4. External payout rail certification (bank/UPI payroll partner evidence) once credentials and sandbox accounts are supplied.
5. Provider pull/push execution, marketplace mapping, and evidence-backed resolution of queued channel conflicts.
6. Production provider/device certification with real credentials.

## Device adapter profiles and safe recovery

The physical-device workbench now has a simple, governed setup path for barcode scanners, ESC/POS printers, cash drawers, and weighing scales. A setup records one scoped profile, a different operator approves it, an independently evidenced command acknowledgement is recorded, and only an approved network TCP profile can become operational. Both the initial test and later network commands are bound to the exact current approved/operational profile version and configured endpoint; retries resolve the current profile again, so an old or redirected command cannot silently use a different device. USB, Bluetooth, and manual profiles remain visibly non-operational until an actual device-specific native integration and physical test are supplied. The app does not claim that metadata, a browser diagnostic, or a reachable endpoint is a working printer, drawer, scanner, or scale.

Offline sale conflicts now require a different supervisor to supply recovery evidence before requeue or discard. The original queue maker can review the conflict but cannot resolve it. This makes a real store-recovery drill auditable without treating an internal button click as proof of hardware recovery.

## Automatic-update status boundary

The Control Room exposes an honest, read-only update status. It reports only whether the packaged Windows/macOS app has a valid HTTPS update-feed configuration; Linux is explicitly unsupported by this boundary. It does not check a feed, download an update, install, restart, or claim rollback success. Those actions remain blocked until signed update infrastructure, platform signing/notarisation, staged rollout evidence, and rollback-drill evidence exist.

## Immutable build provenance

The main process now receives its build revision as a Vite compile-time literal from `EPIC_BOS_BUILD_REVISION` or the source Git commit. It no longer trusts a runtime `EPIC_BUILD_REVISION` environment variable, so changing the environment after packaging cannot rewrite the release identity. A workspace without a traceable source revision is labelled `unversioned-local`: it remains usable for development, but artifact and update evidence is rejected until a source revision is supplied. The Windows bundle was verified with an injected CI revision and the full release-evidence stores enforce the same rule.

## Guided screen acceptance missions

Each of the 48 role journeys now carries a stable workbench surface ID, setup instruction, and four numbered checkpoints: open the screen, perform the journey, compare the observed result to the expected business outcome, and capture inspectable evidence. The acceptance panel keeps the blue, plain-language role tabs but adds one selected mission card so a tester does not have to infer the test path from a bare dropdown. These are guided instructions, not simulated clicks; the release gate still requires real evidence and independent review for every current build.

Every mission now also has an explicit route registry entry. The blue “Open this workbench” action navigates to the actual CRM surface/tab, retail commerce/warehouse/finance workbench, or Control Room sub-tab before the tester begins. Route metadata is part of the scenario fingerprint, so changing a destination invalidates old acceptance evidence instead of silently certifying a different screen.

## Checksummed artifact sidecars

Electron Forge now writes a `.manifest.json` sidecar beside every file produced by `pnpm make`. Each sidecar contains the product/version, Windows/macOS/Linux target, architecture, migration schema revision, immutable build revision, release identity checksum, artifact SHA-256, and its own canonical manifest checksum. The hook skips directories and refuses to create a release manifest for `unversioned-local`, so a filename or version cannot be mistaken for independently traceable release evidence. The sidecar is an evidence input; signing, clean-install testing, review, publication, and provider certification remain separate gates.

Provider connectivity preflight evidence now carries the connector's credential revision as well. A successful health/status response from before a secret rotation is retained for audit history but is excluded from the current certification pack; the operator must run a new preflight and conformance replay with the active credential generation.

The certification pack now also checks physical-device evidence against the exact
adapter profile revision that is currently operational. An acknowledged USB,
Bluetooth, network, or manual response without an operational profile is shown as
a profile gate, and evidence from a changed or suspended profile cannot make the
release pack ready. The pack reports this count separately from prepared and
failed commands; native USB/Bluetooth drivers and real hardware tests remain an
external certification requirement rather than a simulated success.

## Bakaloo retail command-centre release — v0.1.3

The Electron desktop product now opens with a clean, blue-and-white Bakaloo retail command centre: six plain-language paths for POS, orders, stock, delivery, cash, and customers, with all money formatted in INR. The retail workspace owner lands on this simple command centre by default; deeper evidence workbenches remain reachable through progressive disclosure instead of overwhelming a first-time operator.

The delivery view is explicitly carrier-independent: it shows only locally governed promises, PIN-code policies, packages, COD custody, returns/RTO, and online exceptions. Active delivery commitments always take precedence over fulfilled history in the due-next queue; live GPS, map, and ETA claims remain withheld until a certified provider supplies those facts.

The release also adds an exact-demo-only Bakaloo cleanup flow. It requires the phrase `RESET BAKALOO`, creates a verified backup, preserves the signed-in owner/session, retires only the known generic demo records and their stale demo evidence, and refuses to touch changed business records. Empty channels no longer display false visual activity, delivery links move accessible focus to their target desk, and routine retail guidance is enlarged for clear counter-PC use.

Collections recovery now includes a read-only credit-policy what-if preview. It
compares cash-protection, balanced, and growth scenarios from the selected
customer's approved credit control, receivable exposure, payment-status proxy,
dunning cases, and open disputes. It displays projected INR headroom, expected
loss, utilization, and the approval tier without creating or approving a credit
limit; the governed maker/checker flow remains the only write path.

The simple Sell front door now surfaces offline checkout attention before the
operator opens advanced POS controls. Queued and conflicting local sales, plus
recorded recovery attempts, are shown as a truthful handoff to the governed
recovery queue; the front door never calls a sync, invents a receipt, or treats
local queue evidence as a posted sale.

The Stock front door now includes an omnichannel inventory-truth projection.
Open website, marketplace, ONDC, and WhatsApp demand is grouped by local SKU;
available bin units are compared with demand that is not already reserved, and
short, covered, and unmapped rows are separated. This is a planning/read view:
it never reserves stock, changes a channel order, or treats imported remote data
as live provider authority.

The Deliver front door now starts with a compact delivery-control overview. It
counts active and overdue promises, dispatch backlog, in-transit packages, COD
custody, return/RTO attention, overdue fulfilment tasks, and active pincode
policies from local evidence. The promise calendar links each row to its local
sales order and clearly separates overdue, due-today, and scheduled commitments.
It deliberately does not invent a map pin, rider location, carrier ETA, or
provider acknowledgement; those remain behind the governed delivery desk and
external certification gates.

The Windows packaging path was rerun after this slice with immutable revision
`ci-delivery-control-2026.08.04.1`. The unsigned local installer is
`out/make/squirrel.windows/x64/Epic BOS-0.1.3 Setup.exe`; its sidecar records
schema revision 23, release identity
`e55e83a50dc9ba0b07d2074b9640a108f0e5857a9507225ce1bfffedce449b51`, and
artifact SHA-256
`5188e2d8e0ff59e80a006c992a4b58d4d11e6d9c9171e804ba3245612c66c9fc`.
This proves a reproducible unsigned Windows artifact only; signing, clean
install review, macOS/Linux builds, update publication, and provider/device
certification remain separate gates.

The Money front door now includes electronic-tender settlement visibility. UPI,
card, and bank-transfer receipts are compared with locally imported bank
statement lines using the existing reconciliation evidence; the view reports
recorded INR, matched INR, gap, and the exact next action without treating a
receipt as a bank settlement. Cash remains on the separate till close and
variance path, and missing bank lines stay an explicit reconciliation gate.

Windows installer evidence: `Epic BOS-0.1.3 Setup.exe`, build revision `ci-bakaloo-retail-2026.08.03.4`, schema revision 23, SHA-256 `56dcaa031ab664b4113656da7c12c1341302db5a0d92a5b193ee984f27bb24b4`. The adjacent immutable manifest is release evidence only; code signing, independent clean-install verification, macOS/Linux target builds, and real provider/device certification still require their respective evidence.

The Setup front door now gives a first-time operator a simple status view for
workspace provenance, external-write policy, local database health, migration
count, and pending sync evidence. Its only action opens the existing governed
control room; it does not imply that credentials, device drivers, imports, or
provider certification exist.

The Deliver front door now also includes a channel-health summary. It reports
connector certification coverage, recorded pull/push runs, unresolved order or
settlement conflicts, and variance in INR from the existing local evidence.
Top conflicts show the accountable connector and suggested next step, while
all approvals, retries, and provider writes remain behind the advanced channel
control plane.

The Windows artifact was rebuilt after the Money settlement and Setup slices
with immutable revision `ci-retail-setup-settlement-2026.08.04.1`. The unsigned
installer is `out/make/squirrel.windows/x64/Epic BOS-0.1.3 Setup.exe`; its
manifest records schema revision 23, release identity SHA-256
`b9faf2b1c5de90b1ecd234a6dcf27e31f5c8cd0e27f0cd6d190cea959483eac1`, artifact
SHA-256 `0075afb812384619e461f4a9be447076ddd32cdf9f0f5056086d7f865a9894dc`,
and manifest SHA-256
`93e249da72346a81922606494d465af4a6abdcd15056a77d97c4ad938ac04485`.
This is unsigned Windows build evidence only; clean-install review, signing,
macOS/Linux packaging, update publication, and real provider/device evidence
remain open.

Credential-free Bakaloo HTTPS transport completed on 2026-08-04. The Hub now
offers a GET-only same-origin HTTPS adapter around the bounded shadow pull
contract. It rejects unsafe URLs, non-JSON responses, non-200 status codes, and
oversized responses; only a server-owned requester may add authentication.
The adapter still performs no live call by itself and cannot write back to
Bakaloo. Retail Hub verification passes 10 files / 34 tests; the full root
suite passes 222 files / 900 tests, with TypeScript and ESLint clean.

Cache-safe Windows artifact: version `0.1.13`, build revision
`ci-retail-0.1.13-bakaloo-https-readonly-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.13 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`fbbc34fd475e35cfcd6279fce295c93c952ace02ab7a2e309390ef7ccbd27e49`, artifact
SHA-256 `3954cf7f962264a082e90600db1861e00aadd4636c0a03df90f02f368252305f`, and
manifest SHA-256 `f822b77accd693ba7e223f4955c95959cb52ecfb278aaf8af358cc0af4a4b605`.
This is unsigned Windows evidence only; live credentials, source data,
external certification, signing, and production cutover remain open.

Shadow credential-generation binding completed on 2026-08-04. Shadow evidence
can now retain the non-secret provider credential revision used for a snapshot;
the HTTPS adapter verifies the authoritative revision before every page and
aborts on rotation. Legacy exports without a revision keep their prior checksum
format for compatibility. Retail Hub verification passes 10 files / 35 tests;
the full root suite passes 222 files / 901 tests, with TypeScript and ESLint
clean.

Cache-safe Windows artifact: version `0.1.14`, build revision
`ci-retail-0.1.14-shadow-credential-revision-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.14 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`85c6cd817ef3afb8f2c134f1564d4821375d382ff303523ee58bcfb23e965730`, artifact
SHA-256 `c0d15b2167c55fc6040c70b2ef45d31068a0374cf69367a182dc25632857c7d6`, and
manifest SHA-256 `32289bb09d2a6a6ba98633a95baa5593f54597373a5b62619e18d220f9b4c92f`.
This is unsigned Windows evidence only; real credentials, source data, device
drivers, external certification, signing, and production cutover remain open.

The Windows artifact was rebuilt after the channel-health slice with immutable
revision `ci-channel-health-2026.08.04.1`. The unsigned installer is
`out/make/squirrel.windows/x64/Epic BOS-0.1.3 Setup.exe`; its manifest records
release identity SHA-256
`25f95312ba18c709d3d2901177672ff896da22c75c3a0ab43458a73ee56a206e`, artifact
SHA-256 `99121160e5e217a3bc529054aac89ffb4f17dec18719f330d84b157e51a729f9`,
and manifest SHA-256
`d112a0a6239ff71c4dacc592ea68ddd4a41ddfb4f6eb1221a9da2ffbc7244833`.

Because the previous local package used the same `0.1.3` version, the product
version is now `0.1.4` so Windows installers cannot silently reuse the old
cached package. The cache-busting installer manifest uses immutable revision
`ci-retail-0.1.4-channel-health-2026.08.04.1`, release identity SHA-256
`906d68bae012a7d1d35f008b3f6a5a8d9d9a10239a6f4e08b4d84a8cd90800fd`, artifact
SHA-256 `2efaf17aa156dfbb2779bb3d2aa6b7a3a3b5b188094f85f4ba7a35958eba1153`,
and manifest SHA-256
`3df7857ab5bd9aac44b0fcc1159ac212f8981f1ff124a43e3d9b6a497c32d75d`.

The cache-busting Windows artifact was rebuilt again as version `0.1.5` after
the Setup device-profile summary. Its immutable revision is
`ci-retail-0.1.5-device-summary-2026.08.04.1`, release identity SHA-256
`b130dd21e1b2ceffc2f9049d80ea4d3ca3dec605e460b0342cc205384899577e`, artifact
SHA-256 `a8f93e91ec2e0f1669ae8a9a454eb0d2120e736c6efe7ebd9d3e6b38f641c0b1`,
and manifest SHA-256
`a5ebdd31134dbfe7a63c5608feef272479d44f0275403d87752bf35ada24f969`.

The focused slice checks and static gates are green. The full Vitest run is not
yet green because the legacy `src/renderer/App.test.tsx` still asserts the
pre-retail-first shell (generic Bharat tabs, old headings, and old navigation)
against the new direct Home/Sell/Stock/Deliver/Customers/Money/Insights/Setup
experience. Those assertions are a test migration task, not permission to
restore the removed generic demo surface.

Renderer acceptance migration completed on 2026-08-04. The App journey suite
now targets the direct retail-first shell and passes 34/34 journeys, including
lead capture, command-palette actions, customer 360, POS, stock, delivery,
cash/settlement, insights, setup, workspace navigation, recovery focus, and
India-first copy. The full Vitest gate is now green: 220 files and 892 tests
passed. TypeScript and ESLint also pass with zero errors. Longer renderer
journeys have explicit 20-second budgets because they exercise the Electron
bridge and asynchronous local snapshots; this changes no runtime behavior.

The Bakaloo shadow-export review front door now reports identity-map coverage
and duplicate external identities before Hub registration. It counts mapped
versus unmapped records, flags duplicate entity/external-ID pairs, and states
the exact review workload. It remains a local preview only: checksum
verification, registry persistence, reconciliation approval, and all live
writes stay in the Retail Hub boundary. Focused review tests pass 3/3.

Cache-safe Windows artifact: version `0.1.6`, build revision
`ci-retail-0.1.6-shadow-review-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.6 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`017f3aba6a450321364ae9eb6393dc40f5b777df9d82b6756f2cefff3f739b3f`, artifact
SHA-256 `4ed3f3b0a182d4f92f33e891d1f01802d5d0fa041bc158b347ae2573ad1cff94`, and
manifest SHA-256
`96ffad5bd5c4697c367dca72620af14ae6bcc7510e902132ca5e55b04400c789`.
This is reproducible unsigned Windows evidence only; signing, clean-install
review, macOS/Linux packaging, update publication, and real provider/device
certification remain open gates.

Post-package verification on the shipped 0.1.6 tree is green: 220 Vitest files
and 893 tests passed, with TypeScript and ESLint still clean. The additional
test covers duplicate external identities in a shadow export; no live Bakaloo
or provider system was contacted.

Retail Hub authorization hardening is now present in the durable read-only
service. A trusted deployment adapter may provide an actor, tenant/company/
branch scope, and the explicit `shadow-import:read` permission; missing
authorization or permission is rejected before repository access. Renderer
scope values remain untrusted and all mutation verbs remain `405`. Hub verify
passes 7 files / 22 tests, with root typecheck and lint clean.

Cache-safe Windows artifact: version `0.1.7`, build revision
`ci-retail-0.1.7-hub-authz-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.7 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`9cf34b5655fd881e72acf92e23922fcd988c6035f811067586c54e793fcf0f8f`, artifact
SHA-256 `d3f3262dcad6d23acd2d01c912062e26e423ae7875319904f669ecbeea1eb975`, and
manifest SHA-256
`74c9d56e595540d119d7b3ba9e11a72b29b2bf09c436a6f9a3d42c3e67945e92`.
This remains unsigned Windows evidence only; production identity provider,
database credentials, live Bakaloo connector credentials, device drivers, and
external certification are still required before a real cutover.

Controlled shadow reconciliation review is now implemented. Review decisions
are explicit `accepted` or `rejected` records, bound to the authenticated actor,
tenant/company/branch scope, source-plan checksum, and decision time. Acceptance
is rejected unless the plan is fully reconciled; rejection requires a reason.
The durable PostgreSQL store and migration are scoped and clone stored JSON.
The durable HTTP service exposes GET history and a POST decision route only
with `shadow-import:review`; the route records internal evidence and never
writes to Bakaloo, orders, inventory, or payments. Hub verification is green at
8 files / 28 tests.

Cache-safe Windows artifact: version `0.1.8`, build revision
`ci-retail-0.1.8-review-decisions-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.8 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`2605d45289e69317b9f5803f8d54b3a96341eea5616b345e40530aa2cc246fbb`, artifact
SHA-256 `5b42cf66cbc421456b268c5ab212d0ecf973f226e0ba4afc5bd4580fe017363e`, and
manifest SHA-256
`7affc6dece9fd17fbaa5d75a1a96fd09302fdf9c2ba140370ab33c634ac2f4b7`.

## Explicitly not represented as complete

Provider credential lifecycle hardening completed on 2026-08-04. Generic provider
connectors now evaluate protected credential material as `missing`, `configured`,
`expired`, or `revoked` at an explicit timestamp. Expiry and revocation block
conformance assessment, activation, preparation, and handoff; revocation also
clears activation approval. Credential resealing records a new monotonic
generation and invalidates prior conformance/preflight evidence by revision.
Readiness and revenue snapshots expose the lifecycle gap without exposing
secrets. Focused provider/readiness tests pass 10/10; the full root suite passes
220 files / 895 tests, with TypeScript and ESLint clean. Two slow renderer
acceptance journeys now carry explicit 20-second budgets for the Electron bridge.

Cache-safe Windows artifact: version `0.1.9`, build revision
`ci-retail-0.1.9-credential-lifecycle-2026.08.04.3`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.9 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`f1df43e394ae05ced78d530ac87d54d250688181a8ee85697d73f836cf31685b`, artifact
SHA-256 `13e11af7157b58622308c31daf5318043730577271abb3673a3c7ffd7e8599ee`, and
manifest SHA-256 `f3ff3cc719a93ab65e07bf08c53631b7cfe5cb8e4f8738c25e1f400ff7d52b77`.
This is unsigned Windows evidence only; real provider credentials, device
drivers, external certification, signing, and production cutover remain open.

Provider certification-pack hardening completed on 2026-08-04. Production
provider rows now consume the credential lifecycle gate directly: expired or
revoked credentials produce missing capability evidence and the explicit
`configure-credentials` action, even when old replay evidence remains stored.
Freshness reports also refuse to classify evidence as current for a dead
credential generation. Focused certification/readiness coverage passes 20/20;
the full root suite remains green at 220 files / 895 tests, with TypeScript and
ESLint clean.

Cache-safe Windows artifact: version `0.1.10`, build revision
`ci-retail-0.1.10-provider-certification-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.10 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`8a0a9a4c0131e8e711e044cd2577ed54ba3bb191cab42a645c3a820e0ae95718`, artifact
SHA-256 `adb5f89347bbb7a057537dcfc90057ebc527934846e636017d4a70a3505d7216`, and
manifest SHA-256 `f48b4b745a22969e24440a9a6c3fd528c1777a55c53f46208d49a3e047f011d6`.
This is unsigned Windows evidence only; live provider/device certification,
real Bakaloo shadow data, signing, and production cutover remain open.

Shadow-review acceptance idempotency completed on 2026-08-04. The in-memory
review store now rejects a second accepted decision for the same scoped batch,
and the PostgreSQL migration adds a matching partial unique index. Rejected
decisions remain an append-only audit trail; acceptance remains internal review
evidence with `writeBackAllowed: false`. Retail Hub verification passes 8 files
/ 29 tests, and the full root suite remains green at 220 files / 895 tests.

Cache-safe Windows artifact: version `0.1.11`, build revision
`ci-retail-0.1.11-shadow-acceptance-idempotency-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.11 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`74e8a22e0a46e0fec37f6781262fbfe972764eade2a5cf14655582574a0b785c`, artifact
SHA-256 `622fef495ff82f82377881808fb70f4d45731eaa100ed38ebc933234b674dd2d`, and
manifest SHA-256 `cef44063e2290afc40722aa4fa1786e7c131b211b7ccad5a20105ed1367f78da`.
This is unsigned Windows evidence only; real Bakaloo shadow data, provider/device
credentials, signing, and production cutover remain open.

Server-side Bakaloo shadow-pull seam completed on 2026-08-04. The injected
`ShadowImportSourceAdapter` exposes only paginated reads; the collector requires
source-declared totals, enforces page/record limits, rejects repeated or
non-advancing cursors and credential-like payload keys, and emits the existing
checksummed reconciliation plan. It performs no persistence or write-back and
does not claim live connectivity. Retail Hub verification passes 9 files / 32
tests; the full root suite passes 221 files / 898 tests, with TypeScript and
ESLint clean.

Cache-safe Windows artifact: version `0.1.12`, build revision
`ci-retail-0.1.12-bakaloo-shadow-pull-seam-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.12 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`01ab36e051647b1945da09ad14cd083656b47a59943051932cccf55b99f001cb`, artifact
SHA-256 `5f84b57a12681f3aceb8455b9f005c08303525a5a483f834a59953546bf637ca`, and
manifest SHA-256 `f1b2438547326e5624af5668ef9086990f51a0534558800f8c37a538776293fc`.
This is unsigned Windows evidence only; actual Bakaloo credentials, live source
data, device drivers, external certification, signing, and production cutover
remain open.

- UPI/card evidence is not a claimed bank settlement.

Shadow-review credential acceptance gate completed on 2026-08-04. When a
snapshot carries a credential revision, the trusted review service now resolves
the current revision before accepting it. Missing or mismatched generations
are rejected with a fresh-pull requirement, so credential rotation cannot
leave stale approval evidence active. Rejected decisions remain an audit trail;
write-back remains disabled. Retail Hub verification passes 10 files / 37
tests; the full root suite passes 220 files / 896 tests, with TypeScript and
ESLint clean.

Cache-safe Windows artifact: version `0.1.15`, build revision
`ci-retail-0.1.15-shadow-review-credential-gate-2026.08.04.1`, unsigned
installer `out/make/squirrel.windows/x64/Epic BOS-0.1.15 Setup.exe`. Manifest
records schema revision 23, release identity SHA-256
`8c24bf2c4e537543d19a2511588eb6ac7b1dfe706cdf4ba6f6a9a99b03fa50ba`, artifact
SHA-256 `a03dccb3132604f8ef4740c18c41abf936c481ccf6a87ecafa690c1e76700f08`,
and manifest SHA-256
`d4e253a63113dd63dc5f77871aa6610be43f02538575cd7cc253106376096aaf`.
This is unsigned Windows evidence only. Real Bakaloo credentials/source data,
device drivers, external certification, signing, and production cutover remain
open.

Credential-rotation invalidation projection completed on 2026-08-04. Historical
accepted decisions now remain visible for audit but are projected as `active`,
`stale`, or `unverified` against the trusted current credential generation.
This makes a rotated secret remove the approval's operational validity without
destroying evidence. Retail Hub verification passes 10 files / 39 tests; Hub
TypeScript and root ESLint are clean.

Cache-safe Windows artifact: version `0.1.16`, build revision
`ci-retail-0.1.16-shadow-approval-staleness-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.16 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`d1058e265c8181ef380bff80867771337f2bafe20509edd4a1d96d8e5cbc5145`, artifact
SHA-256 `fe164ccc782d8cb278d07766d0b1afdd4837b58ee6dbbeb6ffd085a07950c185`,
and manifest SHA-256
`313900a557615010d7a3cc66e8e1178d57a3ed7f09303710330f4f239603d211`.
Real Bakaloo credentials/source data, device drivers, external certification,
signing, and production cutover remain open.

Server-owned shadow pull registration completed on 2026-08-04. The Hub now
offers an internal `pullAndRegisterShadowImport` orchestration seam that runs a
bounded GET-only source adapter, registers the checksummed plan only after a
complete successful pull, and refuses to overwrite an existing batch. It is
not an HTTP renderer route and performs no write-back. Retail Hub verification
passes 11 files / 42 tests; the full root suite passes 220 files / 896 tests;
Hub/root TypeScript and ESLint are clean.

Cache-safe Windows artifact: version `0.1.17`, build revision
`ci-retail-0.1.17-shadow-pull-registration-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.17 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`6d16e58b2055405e5b00a249d90aa1f54b1b9769efac40e59239afe926aaeaa2`, artifact
SHA-256 `34a0c704f2a5206b2536a28eb6c36057ab257d6be699b6704849b791e37f2903`,
and manifest SHA-256
`1cc8c7530bbf06e874916b96a78442f552cffbc7f8ac860f1f382d9bd5d08307`.
Real Bakaloo credentials/source data, device drivers, external certification,
signing, and production cutover remain open.

Duplicate-pull protection tightened on 2026-08-04. The registration seam now
rejects an existing batch before invoking the source adapter, then checks again
after the pull for race safety. Hub verification remains 11 files / 42 tests;
root TypeScript and ESLint remain clean.

Cache-safe Windows artifact: version `0.1.18`, build revision
`ci-retail-0.1.18-shadow-pull-duplicate-guard-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.18 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`d658613c8da389dc0f212eeb0b5022987c7f9b8767d60c2e5edf2a61da30914a`, artifact
SHA-256 `6566a2ad021940064710483d0a9720cf003b3b56753bd46e8c7df3d0ce88f3ed`,
and manifest SHA-256
`0ba78a094561757d5462c4ae42cabba4aefc14326f440d92b2f95c74517de0f2`.
Real credentials, device drivers, external certification, signing, and
production cutover remain open.

Native device-driver boundary completed on 2026-08-04. USB/Bluetooth
transport can now accept results only through a main-process contract that
requires an exact approved profile revision and driver code/version. The
stored evidence contains response protocol, reference, checksum, and bounded
length only; raw peripheral bytes never enter renderer state. Driver-reported
`unsupported` is persisted distinctly from acknowledged hardware and cannot
be treated as operational. This does not install or certify a real scanner,
printer, cash drawer, or scale driver; provider/hardware certification remains
external.

Cache-safe Windows artifact: version `0.1.24`, build revision
`ci-retail-0.1.24-native-device-driver-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.24 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`249ca96780e5b34bc2128fda02338e2844153bbd2abf912fcb984017637880c6`, artifact
SHA-256 `09aa189169a175d53f68a313c8d6cb9f07cd0305773a2fc550415c34ba9ed916`,
and manifest SHA-256
`3d6caa8b3df9ab9df523d158ca9f4e68e05a641c8d6321cf97bd62cbd8446c26`.
Full root verification passes 220 files / 897 tests; TypeScript and ESLint
remain clean.

Server-owned source health completed on 2026-08-04. Durable Retail Hub health
and `/v1/shadow-imports/source-status` now expose only an injected, bounded
source state (`unconfigured`, `configured`, `reachable`, or `unreachable`) and
optional credential generation metadata. Renderer requests cannot claim source
reachability, and the default remains unconfigured. Hub verification now
passes 13 files / 53 tests with Hub TypeScript clean.

Capability cutover assessment is now exposed through the authenticated
read-only Hub route `GET /v1/shadow-imports/cutover`. It accepts a batch and
capability query, evaluates the trusted scope/current credential generation,
and never provides a write method. Retail Hub verification passes 13 files / 51
tests; Hub TypeScript and root ESLint remain clean.

Cache-safe Windows artifact: version `0.1.23`, build revision
`ci-retail-0.1.23-shadow-cutover-route-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.23 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`4c2a95a48928fae052f0dcac505d029107cad6a68d920b48f7526f72d2dbe2ef`, artifact
SHA-256 `3d9a4979fa21501e3fe12b1df9fc5a5d4cf6a99911384aacf6d43a17374a9ce6`,
and manifest SHA-256
`267a32eef775a2f32e4a446848b444db003302b1a6240e9797927aa5aa773376`.
Real credentials, device drivers, external certification, signing, and
production cutover remain open.

Capability-level shadow cutover assessment completed on 2026-08-04. The Hub
now evaluates catalog, inventory, customers, orders, delivery, settlements,
campaigns, and storefront capabilities independently. A capability is ready
only for a controlled parallel run when its entities are reconciled and mapped,
its scoped approval is active, and its credential generation is current.
Write-back remains disabled. Retail Hub verification passes 13 files / 50
tests; Hub TypeScript and root ESLint remain clean.

Cache-safe Windows artifact: version `0.1.22`, build revision
`ci-retail-0.1.22-shadow-cutover-assessment-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.22 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`51576980e4002547833b9e0cdc6df274cedc49b46fc046d6671d3ce19ad2e6a0`, artifact
SHA-256 `18e8720d785bc35f6677debf58ef1127f28b3413f856c72c55888999b9e505c7`,
and manifest SHA-256
`a48812f1fa7942fe3ee06a4c857402ba8a09a0cd2b13353565337d6e703a7865`.
Real credentials, device drivers, external certification, signing, and
production cutover remain open.

Durable immutable shadow registration completed on 2026-08-04. The PostgreSQL
repository now exposes `registerPlan`, using scoped `INSERT ... ON CONFLICT DO
NOTHING RETURNING`; a duplicate raises an error rather than replacing reviewed
evidence. `replacePlan` remains available only for the explicit internal
ingestion seam. Retail Hub verification passes 11 files / 44 tests; Hub
TypeScript and root ESLint remain clean.

Cache-safe Windows artifact: version `0.1.20`, build revision
`ci-retail-0.1.20-shadow-postgres-immutable-registration-2026.08.04.1`, unsigned
installer `out/make/squirrel.windows/x64/Epic BOS-0.1.20 Setup.exe`. Manifest
records schema revision 23, release identity SHA-256
`2e4bf603eb11889d8ac7811005e93c4fe2e7f55e4db0388693781454dbe19a58`, artifact
SHA-256 `bcd3db6ab3659a67b1fda7a9a17d5fd1abe542916767614544351f2d64cb3d6d`,
and manifest SHA-256
`1ec97bdca2c948a5210c2f4e44a3a65ee4cb531b7e265b66e49af0f5f5d1d316`.
Real credentials, device drivers, external certification, signing, and
production cutover remain open.

Immutable plan registration completed on 2026-08-04. The registry now exposes
a distinct `registerPlan` operation that rejects an existing batch; only the
explicit internal file-ingestion seam may replace a plan. The server-owned
pull runtime uses immutable registration, preserving reviewed evidence across
in-memory and future durable deployments. Retail Hub verification passes 11
files / 43 tests; root TypeScript and ESLint remain clean.

Cache-safe Windows artifact: version `0.1.19`, build revision
`ci-retail-0.1.19-shadow-plan-registration-2026.08.04.1`, unsigned installer
`out/make/squirrel.windows/x64/Epic BOS-0.1.19 Setup.exe`. Manifest records
schema revision 23, release identity SHA-256
`f09d0a7dab977c92a8b2739249b801c217394b42d3b5035c32eedc0dfcaa1615`, artifact
SHA-256 `54c12ee1215f51c7f6e3e8045e5eb0dac4bc816829e7d581d797e5baf67981cc`,
and manifest SHA-256
`2949f6aa91f2300bd0edeade1b17c1a51813e8e5187f4a728f230345c5ea36cf`.
Real credentials, device drivers, external certification, signing, and
production cutover remain open.

Scoped durable pull orchestration completed on 2026-08-04. The Hub now offers
`pullAndRegisterScopedShadowImport`, composing the GET-only source adapter with
trusted tenant/company/branch scope and PostgreSQL immutable registration. It
checks duplicates before and after collection and refuses repositories without
immutable registration. Retail Hub verification passes 12 files / 47 tests;
Hub TypeScript and root ESLint remain clean.

Cache-safe Windows artifact: version `0.1.21`, build revision
`ci-retail-0.1.21-shadow-postgres-pull-runtime-2026.08.04.1`, unsigned
installer `out/make/squirrel.windows/x64/Epic BOS-0.1.21 Setup.exe`. Manifest
records schema revision 23, release identity SHA-256
`657129cb4e5c9ed18213a54ab48c5f7fb29009569e22c589a7c1eeb8c007134f`, artifact
SHA-256 `d141d04b92258ed1ee1d87a4b6c1e70a4d66ba9766622ff10f0080b3b80dd906`,
and manifest SHA-256
`43adc51d54991c1f44302a1c4b074ba430402ad6a7964e06011000a174bd2524`.
Real credentials, device drivers, external certification, signing, and
production cutover remain open.
- A frozen return GST credit basis is not a filed government credit note; statutory submission/reconciliation remains a separate provider-certified workflow.
- Exchange approval now creates a real replacement POS sale and can issue a remainder store credit; provider payment/device certification is still external.
- Server-owned source health completed on 2026-08-04. Durable Retail Hub health and `/v1/shadow-imports/source-status` now expose only an injected, bounded source state (`unconfigured`, `configured`, `reachable`, or `unreachable`) and optional credential generation metadata. Renderer requests cannot claim source reachability, and the default remains unconfigured. Hub verification passes 13 files / 53 tests; Hub TypeScript remains clean.
- Vault-bound Bakaloo credential handoff completed on 2026-08-04. `createBakalooShadowHttpAdapterFromVault` accepts only a non-secret vault reference and trusted scope, injects headers inside the Hub transport, and binds every page to one credential revision. Missing material, malformed headers, or rotation aborts before evidence acceptance; secrets and vault references never enter shadow plans. Hub verification passes 14 files / 56 tests.
- Vault-backed durable pull orchestration completed on 2026-08-04. `pullAndRegisterBakalooShadowImportFromVault` checks for duplicate scoped batches before resolving credentials, then composes the vault adapter with bounded GET collection and immutable PostgreSQL registration. Hub verification passes 15 files / 58 tests; Hub TypeScript and root ESLint remain clean.
- Durable pull audit receipts completed on 2026-08-04. Successful pulls now emit an immutable receipt containing trusted scope, observation/registration times, credential generation, page/record counts, and plan checksum. PostgreSQL persistence uses the scoped `retail_shadow_import_pull_receipts` table; receipts never authorize write-back and contain no secret material. Hub verification passes 15 files / 59 tests.
- Cache-safe Windows artifact: version `0.1.29`, build revision `ci-retail-0.1.29-receipt-export-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.29 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `c6d3ae6ef1a0fdf2457c87274ef35fdfdfe1b1fabdc1416e4488e2f7213d0e1d`, artifact SHA-256 `f5e95f1a3a4a6eb0329f8739e6f1a54b0cb11df82855891452961ff4d00038bd`, and manifest SHA-256 `3f805432f989e5618d390d99cd76d1e9abc2200df1b61dbd244da43224e51eb3`.
- Pull-receipt export route completed on 2026-08-04. Authenticated GET `/v1/shadow-imports/pull-receipts` now exposes immutable, scope-filtered audit receipts for registered Bakaloo shadow pulls, optionally narrowed by batch ID. It returns no credentials and cannot authorize write-back. Hub verification passes 15 files / 59 tests; Hub TypeScript and root ESLint remain clean.
- Cache-safe Windows artifact: version `0.1.30`, build revision `ci-retail-0.1.30-pull-receipt-route-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.30 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `2c1d3f220f222b32eb7d2680fedaae1442b460dac1269e67dde4c17b94ca0abd`, artifact SHA-256 `3ffaa0839f50f51a3bf7ea8caf010c089ea98deb0223a16d11fdee84b08880d0`, and manifest SHA-256 `e4eb97b6fb94cf30c04095176a6ab035a248ce8fb158f8d33ecf4322688e22ab`.
- Atomic durable pull registration completed on 2026-08-04. The PostgreSQL adapter now offers a single-statement CTE that inserts the immutable shadow plan and its audit receipt together; the scoped pull runtime prefers this seam and falls back only for repositories that explicitly expose the older two-call test seam. Hub verification passes 15 files / 61 tests; Hub TypeScript and root ESLint remain clean.
- Cache-safe Windows artifact: version `0.1.31`, build revision `ci-retail-0.1.31-atomic-pull-registration-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.31 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `6c94766b286f6028510a1419fa6bff74ac3abd99a739519bec583c91f40e503d`, artifact SHA-256 `a20a93e3b2153ab79ec58a5007e0b6fd28aa724003b5bb81964f6fac8cc55c6e`, and manifest SHA-256 `fa34a855ad6de88993257e6c1c056d15b6b0f01caae77be28298162f72c2093b`.
- Release-evidence freshness completed on 2026-08-04. Artifact submission now requires non-empty artifact, smoke-test, and signing references; verification is bound to the active platform, version, immutable build revision, and release identity, so a build change forces a fresh submission. Focused release tests pass; root TypeScript and ESLint remain clean.
- Cache-safe Windows artifact: version `0.1.32`, build revision `ci-retail-0.1.32-stale-artifact-verification-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.32 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `03a8c0cf5fdc8a0ebd24596fb9157d06df4ab3affe5e4692867652b7d25aacaf`, artifact SHA-256 `27f1d9cfb84444c0d2a7f8f617adc15e2eb1cdccb270eeefae3c09a56c110b5c`, and manifest SHA-256 `f03d77f9734194f71208d4b6ce4e00397a504232bd43535affe932b62e99befe`.
- Update/rollback evidence freshness completed on 2026-08-04. Update evidence now requires manifest, signature, and rollback-test references; verification is tied to the active platform, source version, immutable build revision, and release identity, so stale update packs cannot be marked verified after a build changes. Focused artifact/update tests pass; root TypeScript and ESLint remain clean.
- Cache-safe Windows artifact: version `0.1.33`, build revision `ci-retail-0.1.33-stale-update-verification-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.33 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `699d305498218ef70d5b7cc2cb33aac837df5e6f02c05d98ebef875d5fd11776`, artifact SHA-256 `444f064aaf1a2721fa69061aec49f3c0f15b0894d7719d2863f96281e2fbbc33`, and manifest SHA-256 `d024a03edf741e4a8e23b20858f19ba6d28d6330ae4dc142186fc2996639d210`.
- UI acceptance freshness completed on 2026-08-04. UI journey verification now requires the active release identity to match the submitted evidence, so a changed build forces the journey to be repeated instead of allowing stale click-through evidence. Focused UI/release tests pass; root TypeScript and ESLint remain clean.
- Cache-safe Windows artifact: version `0.1.34`, build revision `ci-retail-0.1.34-stale-ui-acceptance-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.34 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `df4517c3195756b20bc02fed4f4745c44d80b6621789099371691089a9306e56`, artifact SHA-256 `5d74f58bf08ae48ef9649c07a913d1d264eaed39eaca42c4dd5c722dee39a07f`, and manifest SHA-256 `4b4b2a8d635eb062aeb268c8ad9ab51ea94ed869b8d6b6fa36861b7bc8633375`.
- Cross-platform Linux package produced on 2026-08-04 as an unsigned ZIP: `out/make/zip/linux/x64/Epic BOS-linux-x64-0.1.34.zip`. This is a distinct cross-build revision `ci-retail-0.1.34-linux-zip-cross-package-2026.08.04.1` with release identity SHA-256 `c86bd9044325200d5a19a9b8501ed16cbe2bcad79a2520d494ade63a3fc005b3`, artifact SHA-256 `b92ef5e4b5633de05e30a06cc9989a1546c6fbcc32511fd8dd1f8d9fe6ee6c06`, and manifest SHA-256 `f1aa13a548ef3059a780d3c8e023dab502789e4a05e3dfeeefdc9eff423ae2f9`. It is not certified or smoke-tested; Debian/RPM makers require a native Linux runner and signing remains external.
- macOS cross-packaging was attempted from Windows but produced no ZIP artifact; the native macOS runner remains required for a trustworthy macOS build, smoke test, signing, and notarisation.
- Release manifest verifier completed on 2026-08-04. `pnpm verify:artifact -- <manifest> <platform> <version>` now validates sidecar schema, canonical JSON, manifest checksum, release-grade revision, expected platform/version, artifact existence, and artifact SHA-256. Windows 0.1.35 verification passed; a deliberate platform mismatch failed closed.
- Cache-safe Windows artifact: version `0.1.35`, build revision `ci-retail-0.1.35-release-manifest-verifier-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.35 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `5475b00b627a51e1e36348250597a85964796db2af26921e590805f16ccfad66`, artifact SHA-256 `7862c6067d66c26608dd048ba90b74dfac6267ef8d18d03594bfc8a3e4a042f8`, and manifest SHA-256 `b72b1309165b327c9e89ebe7c73bdf4e392db5a20730b97fb412485c1e51e303`.
- Multi-artifact verification completed on 2026-08-04. `pnpm verify:artifacts -- <directory> <platform> <version>` now validates every installer/package manifest in a release directory; Windows 0.1.36 installer and NuGet artifacts both passed with a shared release identity.
- Cache-safe Windows artifact: version `0.1.36`, build revision `ci-retail-0.1.36-multi-artifact-verifier-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.36 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `ca35aff4cb5076ce63c303a0ccae3aed9579d47a0d852173b4c22badba3f40dd`, artifact SHA-256 `404830b795f57ddcda86e0025089e20e8bf3a37d2f06f5336e50c77fec03e115`, and manifest SHA-256 `8e76c09e9e5624b49f0dce00ba8c803f7a230eb4f90cab4faafbc77ec77b42db`.
- Native release matrix workflow added on 2026-08-04 at `.github/workflows/release-matrix.yml`. Windows, Linux, and macOS native runners install dependencies, run the full verification suite, build platform artifacts, and run multi-artifact checksum verification. Signing, notarisation, and provider/device certification remain separate controlled gates.
- Cache-safe Windows artifact: version `0.1.37`, build revision `ci-retail-0.1.37-native-release-matrix-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.37 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `dedc882649526fa7f18d96bee18edf66d287e911c4df917719ebe343777514cc`, artifact SHA-256 `84631bc15c46de771a9cfb6fdaa606bbc3d1eea91093722d30d99343fd54b8a3`, and manifest SHA-256 `407d322ce1cc3ffd9b7c67d1de27f78d75b60eaad10ada2c2f836842ec77e21a`.
- Native release matrix bootstrap corrected on 2026-08-04: pnpm is installed before Node's pnpm cache setup, and the macOS x64 job targets an Intel native runner (`macos-13`).
- Cutover rollback gate completed on 2026-08-04. Shadow-import parallel-run assessment now requires an explicit tested rollback reference in addition to reconciliation, approvals, scope, and conflict evidence; an otherwise reconciled batch is blocked closed when rollback evidence is absent. Hub verification passes 15 files / 62 tests; Hub TypeScript and root ESLint remain clean.
- Cache-safe Windows artifact: version `0.1.39`, build revision `ci-retail-0.1.39-cutover-rollback-gate-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.39 Setup.exe`. Multi-artifact checksum verification passed for the installer and NuGet package. Installer manifest records schema revision 23, release identity SHA-256 `81bb11efae9afe10896d6b691d0a375ec4388741be2856ae2329fd3d9b363b58`, artifact SHA-256 `5930e79489be16ca197b704440ba503b41179871c6daf9a04689fd1cdf791ef4`, and manifest SHA-256 `d1066fb7b5e88a390e6120f1deaed34b86f7ef27c073430ab0e9a76194956576`.
- Native packaged smoke gate added on 2026-08-04. `.github/workflows/release-matrix.yml` now launches the executable produced by each native runner with `EPIC_BOS_SMOKE=1` before checksum verification; `scripts/smoke-packaged-app.mjs` fails closed unless the packaged renderer emits `EPIC_BOS_SMOKE_OK`, and uses an isolated temporary profile. Windows 0.1.40 smoke passed locally; Linux/macOS still require their native runners.
- Cache-safe Windows artifact: version `0.1.40`, build revision `ci-retail-0.1.40-packaged-smoke-gate-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.40 Setup.exe`. Multi-artifact checksum verification and packaged smoke passed. Installer manifest records schema revision 23, release identity SHA-256 `6b51e0a9e7a3f2c675d5730dd77f288d0589a5c649aebb612922db4e92489b52`, artifact SHA-256 `afaa26a9fad0d2033159fb8e4d9d509a837eb375cc73d8b8181aa31cb225af8d`, and manifest SHA-256 `16c35f3fa6776e489ab935ad7a53a59d7ffb8b108735ab6e089541df96ff8b56`.
- Smoke profile isolation completed on 2026-08-04. Electron now applies `EPIC_BOS_SMOKE_USER_DATA` before session/database initialization, so packaged smoke genuinely uses a disposable profile and cannot touch the operator's real workspace. Root TypeScript passes; Windows 0.1.41 packaged smoke and multi-artifact checksum verification pass.
- Cache-safe Windows artifact: version `0.1.41`, build revision `ci-retail-0.1.41-smoke-profile-isolation-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.41 Setup.exe`. Installer manifest records schema revision 23, release identity SHA-256 `ca982a55f7d98e6f8b4a2d5e3170a7b319ab0612c89491794475d840a4017997`, artifact SHA-256 `3802178d1806b5f5613bb7d07535b9b8fd94fdfd7a9364d76d04257f9abc77ae`, and manifest SHA-256 `a1dba9c5b9bd335064e9c10034fad79fc06b919e42cda3d327716fe3435d4921`.
- Machine-readable packaged smoke evidence completed on 2026-08-04. Native smoke runs now optionally emit `epic-bos.packaged-smoke-evidence.v1` records containing platform, version, immutable build revision, executable path, isolated-profile proof, marker, timestamp, and console-output checksum; no credentials or live data are included. The release matrix uploads these records beside unsigned artifacts for independent certification.
- Cache-safe Windows artifact: version `0.1.42`, build revision `ci-retail-0.1.42-machine-readable-smoke-evidence-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.42 Setup.exe`. Packaged smoke and multi-artifact checksum verification passed. Installer manifest records schema revision 23, release identity SHA-256 `73153314139adc94a5b19b7c307a06d17b97e6e1d50e8c976ee5dd863d342085`, artifact SHA-256 `f60cc268bc45da874411fc4570b54afc38c2c719e45314e7bb0d53bae6589fbc`, and manifest SHA-256 `e8c0eb97a6f0d23b89ca04717ea181f6778e48266dae38db086f32bcd1a936b9`.
- Smoke evidence binding completed on 2026-08-04. `scripts/verify-smoke-evidence.mjs` now requires a passed isolated-profile evidence record and matches its platform, version, and immutable build revision against every release manifest in the artifact directory. The native matrix runs this verifier after checksum verification, so mismatched or stale smoke evidence fails closed.
- Cache-safe Windows artifact: version `0.1.43`, build revision `ci-retail-0.1.43-smoke-evidence-binding-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.43 Setup.exe`. Packaged smoke, smoke-evidence binding, and multi-artifact checksum verification passed. Installer manifest records schema revision 23, release identity SHA-256 `940d318f3fa74efa44c27992027f6822229df31605d0b27c3511b5137a62a4f0`, artifact SHA-256 `34532f682c38f0efc42d58afdb2202ee42417624bf723b22c645f688e4c61c82`, and manifest SHA-256 `0303920585affffec4a830e74bf457190b8107ed5e9e67b6bc4136c317aead8c`.
- Release evidence cross-check completed on 2026-08-04. The native matrix now validates smoke evidence against every platform/version release manifest after checksum verification, preventing one artifact from being certified using another artifact's launch proof. The verifier passed all three Windows manifests for 0.1.43; script syntax and root ESLint remain clean.
- Isolated restore-drill executor completed on 2026-08-04. Admins can now run a governed backup→copy→integrity/schema verification drill from Storage without staging or replacing the active database. The receipt reports pass/fail, both checksums, isolation, timestamp, and a plain-language boundary; temporary drill files are always removed. Focused backup/renderer tests pass (35 assertions), root TypeScript and ESLint remain clean, and `docs/STORE_RECOVERY_RUNBOOK.md` now documents the procedure.
- Cache-safe Windows artifact: version `0.1.44`, build revision `ci-retail-0.1.44-isolated-restore-drill-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.44 Setup.exe`. Packaged smoke, smoke-evidence binding, and multi-artifact checksum verification passed. Installer manifest records schema revision 23, release identity SHA-256 `4aa91845d01132db71222a3ca5f14092d7ff01774a8205cd484bae75be7bf276`, artifact SHA-256 `aa59583b4b28558da977a6b9ca6f3389ee230e3c2061efbe6857f5a29c723a15`, and manifest SHA-256 `0ad6738efcfbb8c4f80f289ca9a2a835b126a2c04646afbf09d64f8343203084`.
- Full-suite stability completed on 2026-08-04. Vitest now allows a bounded 15-second per-journey timeout for busy CI workers; the default `pnpm test` passes 221 files / 901 tests, including the new isolated restore-drill test. This changes only test orchestration and does not weaken application gates.
- Cache-safe Windows artifact: version `0.1.45`, build revision `ci-retail-0.1.45-restore-drill-test-stability-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.45 Setup.exe`. Packaged smoke, smoke-evidence binding, and multi-artifact checksum verification passed. Installer manifest records schema revision 23, release identity SHA-256 `36ceb9bd5fbb55922ce128d9fa998e9362db301a6b53a44de8ef5f29e918f5c3`, artifact SHA-256 `732bf1f83c7c421fb618a81b9bc99f9cb8667e7fd794792c1b2a8d7e196d564b`, and manifest SHA-256 `69f6717a7013195c7e7d63762bc5fa896e52d89a41778cc95c1db562f56762e3`.
- Cache-safe Windows artifact: version `0.1.38`, build revision `ci-retail-0.1.38-native-matrix-bootstrap-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.38 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `cb18e6e38a70f315248b8d4f859fff2c007f6c1b55c1e3291abf7fc66d909e2f`, artifact SHA-256 `9ae6897bff51658fa23fa87a7a9a16e100707b65f45bf11e2ae31457f432c355`, and manifest SHA-256 `2a7c0c48e0bb74a1d390ea34dc4ae97af7fac3927810722880380409294984aa`.
- Current Linux cross-package: version `0.1.36`, build revision `ci-retail-0.1.36-linux-zip-cross-package-2026.08.04.1`, unsigned ZIP `out/make/zip/linux/x64/Epic BOS-linux-x64-0.1.36.zip`. Manifest records release identity SHA-256 `daa3bc10a9d3bd9b4327eea37302c5deeee30e941c2064f04ab4fd5ad0ba8913`, artifact SHA-256 `a9ac30601c4ac2991f0ba66d7ff636f6e987af70e2802f44182b4a1a8f132626`, and manifest SHA-256 `4eeb15299b9fbcbb0dae59ab5e31a76e4186777e14408870424fecce867eace3`. It is checksum-verified but not natively smoke-tested or signed.
- Cache-safe Windows artifact: version `0.1.28`, build revision `ci-retail-0.1.28-pull-audit-receipts-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.28 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `505ee31ef5f5f82167473d7c134d6ee8121a5d11ddc53bbc54aeb3f40f1a2dcf`, artifact SHA-256 `580e2560f444ae030793e3c63070d0f88196c4bce73f892eb3ae8b924e69d4ff`, and manifest SHA-256 `dbe3094e4cc9e506ff738ddce4ee1df565f45d0f8f0cc6c27bca170248746bf6`.

Cache-safe Windows artifact: version `0.1.27`, build revision `ci-retail-0.1.27-vault-pull-runtime-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.27 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `cf260c4c60d4e12fa96d466364825daea14e5be705af34d52643882456041554`, artifact SHA-256 `3ace1897562054ca462cbc8bc8fae23c47ebea9ae8e8ed1a12da96ca1cc9436f`, and manifest SHA-256 `da3bef543a29428e48b83ee120afd88947fff63d56acb9e81d7b33fcf765ea24`.

Cache-safe Windows artifact: version `0.1.26`, build revision `ci-retail-0.1.26-bakaloo-vault-adapter-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.26 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `a78394c83ec0e21a556cbeb19bb80c561d01b7e55ed320d0f2f4b9631928a43b`, artifact SHA-256 `a44be8e11d1080041b2aabfb750d738ef7cd3a80116ee94e4b518f310daeb68b`, and manifest SHA-256 `3c8baf744c2caed52bbcb0f2d80eefcc836b9343792a60b532a78b237e916b88`.

Cache-safe Windows artifact: version `0.1.25`, build revision `ci-retail-0.1.25-source-status-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.25 Setup.exe`. Manifest records schema revision 23, release identity SHA-256 `de99b947d75b26c24be4c9db3cab1c74df057d012b8306daede19a829f93737f`, artifact SHA-256 `5137fae0ef230d797d508c106d7e53ef4e9fb20a417b8b60675076c8a50214ca`, and manifest SHA-256 `c57c5379ea8536618d1ac2ec7405cc490fd716d2885522ef7f58796e36c7de97`.

Durable restore-drill history completed on 2026-08-04. Migration `024-restore-drill-history` stores each drill receipt, actor, status, timestamps, and checksummed source/restored metadata; Storage now lists the latest evidence so recovery review survives restart and is not dependent on a transient message. Full suite passes 221 files / 901 tests; root TypeScript and ESLint remain clean.
Cache-safe Windows artifact: version `0.1.46`, build revision `ci-retail-0.1.46-durable-restore-drill-history-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.46 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, and multi-artifact checksum verification passed. Installer manifest records release identity SHA-256 `49b7dc67fb1683d2c6a287f03117bf1b6d576626cd6bfcff403650453363d2e7`, artifact SHA-256 `1a224c33779fd1f66afee12e94a6a663f6a4efff5cf94fab33c281c9a4a9004f`, and manifest SHA-256 `e35046d88d993dd77d326c6e064f0548d71a58ec85171d8774d66573d39f496f`.
Automatic restore-gate evidence completed on 2026-08-04. A passed isolated drill now creates checksum-addressed `backup-restore` release evidence; if audit-chain or migration health is not valid, the same action records a failed gate and keeps readiness on hold. This removes manual gate typing without treating a database copy as provider/device certification. Focused gate, readiness, and backup tests pass; root TypeScript and ESLint remain clean.
Cache-safe Windows artifact: version `0.1.47`, build revision `ci-retail-0.1.47-automatic-restore-gate-evidence-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.47 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, and multi-artifact checksum verification passed. Installer manifest records release identity SHA-256 `cf2ce5a12fdc2bfe08361b849792ae5aac2c4c6b1096cf1f988ce03e0af2d417`, artifact SHA-256 `00a79a8c5a7ede154d04c75869ad5b90438ad9db5d3555d01442ba7cc2b4109b`, and manifest SHA-256 `377f0d198f0f6b99fd91337cb7dd358dfd55235c5de62fe653d7db0882b46161`.
Release-certification handoff pack completed on 2026-08-04. `pnpm prepare:release-pack` verified the Windows 0.1.47 manifests and smoke evidence, and generated `out/release-certification/win32-0.1.47/release-certification-index.json` plus reviewer instructions. The pack remains `goNoGo: hold` because it contains unsigned evidence and cannot substitute for provider, hardware, or independent approval. A Linux pack was also generated with native smoke explicitly marked `not-provided`.
Cutover execution state is now durable and operator-visible on 2026-08-04. RevenueOps persists scoped RetailCutoverPlan records and exposes authenticated list/create/advance IPC boundaries; the state machine enforces optimistic versions, scope isolation, zero-difference reconciliation, evidence, independent approval, bounded rollback windows, and terminal block/retire/rollback states. The Command Centre shows a plain-language capability register for analytics, catalog/inventory, orders, delivery, and finance. This is still a guardrail, not a claim of live Bakaloo migration: all capabilities begin unstarted/shadow and no live write path was added. TypeScript, ESLint, and focused cutover tests pass.
Cache-safe Windows artifact: version `0.1.49`, build revision `ci-retail-0.1.49-durable-cutover-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.49 Setup.exe`. Schema revision is 24. Full suite passes 222 files / 904 tests. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `5f774a56cae60eb5fd68358d4c4769fc8860d50362c4c7eb71501cfa3a2c5126`; release-certification pack SHA-256 `e5b3176a28f12fcc292e23416785d26c5f0fad46645ba9791be1c0c615803863`. The release remains on hold for signing, provider, device, and independent-review evidence.
Cutover history hardening completed on 2026-08-04. Each new plan now records an immutable creation event, and every phase advance appends actor, timestamp, from/to phase, versions, decision, evidence reference, and block reason where applicable. Older plans are normalized to an empty history during state upgrade without changing their phase or evidence. The operator register reports the number of retained evidence events. This is audit replay only; it does not enable live Bakaloo writes.
Cache-safe Windows artifact: version `0.1.50`, build revision `ci-retail-0.1.50-cutover-history-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.50 Setup.exe`. Schema revision is 24. Full suite passes 222 files / 904 tests. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `0570ad8c8082156612b57743cd6c6a6a05ba45d31ca4365575cc078c22caa373`; release-certification pack SHA-256 `5bbecf118ef5bd7188c7ada41dde6e5fa3ba454a87f023496550256b79aaf730`. The release remains on hold for signing, provider, device, and independent-review evidence.
Governed cutover workflow completed on 2026-08-04. The Command Centre now registers a Hub-verified shadow plan with real capability, scope, counts, four SHA-256 values, and an evidence reference; then exposes only the next valid state-machine decision for the selected plan. Reconciliation, approval, cutover, rollback, retirement, and block actions remain authenticated, optimistic-version checked, independent-actor gated, and persisted with immutable transition history. The panel is explicit that this records local evidence only and never writes to Bakaloo.
Cache-safe Windows artifact: version `0.1.51`, build revision `ci-retail-0.1.51-governed-cutover-workflow-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.51 Setup.exe`. Schema revision is 24. Full suite passes 223 files / 906 tests. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `14a3c4dd54c520685074a64d734570e46424076de2127af9cc72ad75842da982`; release-certification pack SHA-256 `ec297bd208c31e3753b2b5d4ea888c856a264405ca68598f56a38a864c071f9a`. The release remains on hold for signing, provider, device, and independent-review evidence.

Cache-safe Windows artifact: version `0.1.52`, build revision `ci-retail-0.1.52-hub-assessment-handoff-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.52 Setup.exe`. Schema revision is 24. Full suite passes 223 files / 910 tests; Retail Hub passes 15 files / 62 tests. The release adds a read-only Retail Hub assessment import and strict assessment-to-plan handoff with scope, credential revision, record counts, checksums, blocker checks, and write-back prohibition. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `4146d34743ab20e0b4789501495da21c748ca96009eff77819eaf4893d35ecc4`; release-certification pack SHA-256 `e047287062b950632fc1eeca0045e64e5f78ed8d9f6ee6ccd89868c70d410f17`. The release remains on hold for signing, provider, device, and independent-review evidence.

Cache-safe Windows artifact: version `0.1.53`, build revision `ci-retail-0.1.53-hub-assessment-handoff-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.53 Setup.exe`. Schema revision is 24. Full suite passes 223 files / 910 tests; Retail Hub passes 15 files / 62 tests. This rebuild includes the campaign/storefront-to-analytics persistence guard correction. Typecheck and lint are clean. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `5fece915a6128a25f92a813dcc78baa213f9dcd5bde398f07d156c7123a222d1`; release-certification pack SHA-256 `1b5577afa32c92b79d13feb2d5e4789f6e18300a0fcbb8dd74fa81f54b604a19`. The release remains on hold for signing, provider, device, and independent-review evidence.

Cache-safe Windows artifact: version `0.1.54`, build revision `ci-retail-0.1.54-hub-assessment-get-transport-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.54 Setup.exe`. Schema revision is 24. Full suite passes 224 files / 914 tests; Retail Hub passes 15 files / 62 tests. The release adds a main-process-only HTTPS GET transport for authenticated Hub cutover assessments, strict response validation/size/timeout limits, and a plain-language Fetch-from-Hub control alongside JSON import. No renderer-supplied API key or request header is accepted. Typecheck and lint are clean. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `4bb079d359de6124a63dc4e4151ddedc7818ecf1dcb109313769788dcfd7c2e6`; release-certification pack SHA-256 `35acada85ff07b8a4a36302ff05ea72c8785cb923ff5eb60ee65b15211c14752`. The release remains on hold for signing, provider, device, and independent-review evidence.
Offline recovery journal completed on 2026-08-04. Every local retail sale now writes an append-only, scope-bound synchronization journal entry for queued, syncing, synced, conflict, supervisor requeue, and discard transitions. Entries retain actor, attempt, queue version, payload checksum, timestamps, sale reference, and recovery evidence only; sale/tender payloads are never copied into the journal. The POS recovery card shows the latest journal events after restart, making power/network recovery reviewable rather than dependent on the current queue row. Legacy workspaces upgrade the optional journal to an empty register without fabricating history. Focused offline/POS tests, TypeScript, lint, and the full 224-file / 914-test suite pass. The next packaged build is 0.1.55; external signing, provider/device certification, and independent review remain on hold.
Cache-safe Windows artifact: version `0.1.55`, build revision `ci-retail-0.1.55-offline-recovery-journal-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.55 Setup.exe`. Schema revision is 24. Packaged smoke and smoke-evidence binding passed. Installer artifact SHA-256 `9adb0becdada93319dc1c59fa50423ce957afd08018acda201df57ad50873e3c`, manifest SHA-256 `7b64b66f17dfe48b9584445ff765f3f23e5bf0fcba79a14ba34d4f145c00d804`, and release-certification pack SHA-256 `79c3b54439c2ee057a55a8bb5465f8881d9d2e340b72a4207a9b410439413780`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.
Capability cutover guard completed on 2026-08-04. `src/domain/retail-cutover.ts` now enforces shadow → parallel → zero-difference reconciliation → independent approval → rollback-window → retire/rollback for analytics, catalog/inventory, orders, delivery, and finance. It is side-effect free and cannot claim live Bakaloo cutover; the sequence and non-negotiable holds are documented in `docs/BAKALOO_CUTOVER_RUNBOOK.md`. Focused tests (3) and TypeScript pass.
Cache-safe Windows artifact: version `0.1.48`, build revision `ci-retail-0.1.48-cutover-guard-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.48 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `8140661c967764d8c538d16a544e1d89f1b20d9aa7bf5bf8a3a8f2fb8787a807`; release-certification pack SHA-256 `80f69b213d45370036433a42cd029694ff6fbdff2d5c71c59195157b50b1eda5`. The release remains on hold for signing, provider, device, and independent-review evidence.
- External provider, payment, WhatsApp/DLT, scale, printer, marketplace, ONDC, or portal certification requires the selected provider's credentials and evidence. The POS readiness panel reports these gates from actual connector, credential, conformance, adapter, and acknowledgement records; it never converts missing external evidence into a false “ready” state.

Unified omnichannel order inbox completed on 2026-08-04. Source-neutral order evidence from POS, website, mobile app, WhatsApp, ONDC, and marketplaces now persists in the scoped RevenueOps snapshot through a durable `retailUnifiedOrderIngestion` register. The IPC/preload seam validates INR payloads, channel/status lifecycles, line identity, and bounded amounts before recording anything. Shadow mode is read-only evidence; governed mode emits only a pending stock-reservation/reconciliation boundary. External event IDs and SHA-256 digests make replays idempotent and payload drift/open lifecycle conflicts explicit. Governed handoff now records independent approval evidence and rejects the actor who first observed the source order. The new blue-white, INR-first inbox has labelled fields, no nested scroll trap, empty-state guidance, conflict/reservation/reconciliation counters, and no live Bakaloo/provider write path. Focused unified-order/commerce/offline/inbox tests pass (23 tests), TypeScript and ESLint pass, and the full suite passes 225 files / 916 tests. Next packaged build is 0.1.56; external provider, device, signing, and independent-review evidence remain on hold.
Cache-safe Windows artifact: version `0.1.56`, build revision `ci-retail-0.1.56-unified-order-inbox-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.56 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `8390b74fd14532cf37c7f241038e17eb153dab4e8b70594861180da245917b6c`, installer manifest SHA-256 `d0e033b73fffffa393f9db7275acffd57d90ffd79a0f26597027c333c51f7f1b`, smoke evidence SHA-256 `48398f93ef112198d97310a589fac87c36c3567ddae7a3e698b8690b1d31eac4`, and release-certification pack SHA-256 `39a2bfcff2ae6df2e931377a1248757385bf798556b1af61fd97b1944aaf8e4c`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Retail Hub order handoff outbox completed on 2026-08-04. Independently approved unified orders can now be prepared into a durable, local-only `retail-hub` handoff record that retains the order/source digest, envelope checksum, attempt, version, and maker evidence without retaining a second payload or performing HTTP/Bakaloo/stock/payment writes. A separate reviewer can record an acknowledged, retryable, or rejected response only with a real reference and SHA-256 checksum; stale versions, terminal replay, and same-actor maker/checker attempts are rejected. Legacy unified-order state upgrades missing `hubHandoffs` to an empty register. The blue-white inbox now exposes a plain-language Hub outbox and response evidence form; no provider response is fabricated. Full suite passes 225 files / 918 tests, focused unified-order/inbox/App tests pass 47 tests, TypeScript and ESLint pass. The release remains on hold for live Hub/provider credentials, device evidence, signing, and independent review.
Cache-safe Windows artifact: version `0.1.57`, build revision `ci-retail-0.1.57-hub-order-outbox-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.57 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `ab00a6e564baa5d51f0528a8c6cd7fd27fd72a7f8d91318bafe78220bec982e2`, installer manifest SHA-256 `400f6e10e14f154a26cb390208f7200802a851474f6f11e63d29f335cd541304`, smoke evidence SHA-256 `c7d6a36d16cdc8f72ca1062c0afd42b8d80bbbd9f03a578572783285ef468220`, and release-certification pack SHA-256 `19806d30e6472e679c0c0b8a6a7eed1f04e196e6c234110511bc95868f67017b`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Retail Hub outbox attempt history completed on 2026-08-04. Retryable response evidence now stays append-only: preparing a fresh retry retains every prior attempt's checksum, actor, version, response reference, outcome, and timestamps instead of overwriting the last result. Legacy records without history remain readable through a deterministic one-attempt fallback. The unified order inbox exposes the current attempt and retained history count while continuing to block live provider/Bakaloo writes. Focused tests pass, TypeScript and ESLint pass, and the full suite passes 225 files / 919 tests. The release remains on hold for live provider/device evidence, signing, and independent review.
Cache-safe Windows artifact: version `0.1.58`, build revision `ci-retail-0.1.58-hub-order-outbox-history-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.58 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `c4c59d4df1388aeceed8c4f90fbc37ff03c3bf79658a3278648528f09f7c876c`, installer manifest SHA-256 `88a8aef7572256e58e7f2a98424c81474e6ffc12c5faf6fb36926659c8c8b4b3`, smoke evidence SHA-256 `37404e58cc3d8901d464fbd6b07e72931c7a3a1a4e429a38a6b0948c1e2b8c7e`, and release-certification pack SHA-256 `4115375477466e089779122035d1fdff0a930b3b5ed86e7a89dd0084ca0c5ec8`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Unified order-to-fulfilment mapping completed on 2026-08-04. A governed external order can now be mapped to an existing in-scope Epic BOS sales order using explicit evidence, then independently approved or rejected. The record stores source digest, sales-order identity, maker/checker actors, decision remarks, timestamps, and optimistic version; open order conflicts, stale source evidence, inactive sales orders, and same-actor decisions are blocked. This is intentionally an evidence-only handoff: it does not mutate the sales order, stock, payment, delivery, or Bakaloo. The unified order inbox now exposes a simple INR-first mapping and review task. Full suite passes 225 files / 920 tests; TypeScript and ESLint pass. The release remains on hold for live provider/device evidence, signing, and independent review.
Cache-safe Windows artifact: version `0.1.59`, build revision `ci-retail-0.1.59-unified-fulfilment-mapping-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.59 Setup.exe`. Schema revision is 24. Full suite passes 225 files / 920 tests; TypeScript and ESLint pass. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `40cd797ff895ade9723ac36a92d366ea5abe90f7dacf160d996c4c4a43bd3dfd`, installer manifest SHA-256 `826c84726ada25597463f5d053aa6d11108f172df5a1ac29a3d25a22786aa9a3`, smoke evidence SHA-256 `9098a871e3e7213f099ebea9fb96f9541752a2c6915c1bec03e676d471a3b12`, and release-certification pack SHA-256 `84dfd4f41cc10d35b52fe4b8879b76393ae0c42a1c15872f36903fa336a6c234`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.
Stock reservation execution completed on 2026-08-04. After an external order is independently mapped and approved to an in-scope Epic BOS sales order, the operator can select an active store/warehouse location and reserve exact mapped quantities. The workflow validates source digest, open conflicts, current reservation intent, sales-order line capacity, active SKU/product scope, existing reservations, and available stock before mutating the local stock ledger. It records reservation IDs, location, actor, timestamp, and evidence; retries are idempotent. Picking, packing, dispatch, payment, tax, delivery, and provider writes remain separate. Full suite passes 225 files / 921 tests; TypeScript and ESLint pass. External provider, device, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.60`, build revision `ci-retail-0.1.60-unified-stock-reservation-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.60 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `eb724668e88b932e9d8a4b0ba322dec7c73c2f3e771e279b54809c9f6f4f0f2b`, installer manifest SHA-256 `206daa9571542b22e3ea2afcb4b50ae30de5b2516ca12a6f79c20b34192c5b2a`, smoke evidence SHA-256 `58a90c86eb901a9f29cee39b9f5a0102645ef832816bc60131817a4a8488e28`, and release-certification pack SHA-256 `6f54bb1223308bf51c929d44827e2ebb00674459dfd372ef35b7bebe7db17e10`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.
Warehouse pick-task planning completed on 2026-08-04. A completed local reservation can now create a directed warehouse pick queue from real storage/picking-bin balances, ordered by bin pick sequence. The boundary validates active warehouse scope, reservation state, SKU identity, serial-control requirements, bin availability, due time, priority, and idempotent replay; it records every planned task and evidence without marking any task picked. Warehouse staff must still start and complete the tasks before packing or dispatch. Full suite passes 225 files / 921 tests; TypeScript and ESLint pass. External provider, device, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.61`, build revision `ci-retail-0.1.61-unified-pick-queue-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.61 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `b0eba7de1ed0e58675402fbc342dd5b7701a781f035ac9cdb56530a028cf5e28`, installer manifest SHA-256 `f3efb80a32bb14256a41e2495db21ea430620bd580ae780d567f5d751364d90d`, smoke evidence SHA-256 `6293b7ff1c71c90a7e641139006bfce1fedcbfe5f8f744cbe6adb7c7f78eb657`, and release-certification pack SHA-256 `077bb8287c3e276cfd9d10bcf756988092a0ddf9e6f949a0991577572c38826c`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Pick-wave completion and pack gate completed on 2026-08-04. A unified order can now close its directed pick queue only when every planned warehouse task is completed, in scope, and exactly covers the approved reservation quantities. Completion evidence, actor, and timestamp are persisted; the order moves to `awaiting-pack` without creating a shipment or contacting Bakaloo. Unified mapped orders are blocked from package creation until this boundary is complete. Focused tests, TypeScript, and lint pass. External provider, device, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.62`, build revision `ci-retail-0.1.62-pick-completion-pack-gate-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.62 Setup.exe`. Schema revision is 24. Full suite passes 225 files / 921 tests; TypeScript and ESLint pass. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `3ac5827dc5955227ea42d9672378f074f33372b0a7291ce4f4da708212e7227e`, installer manifest SHA-256 `273b67a0d6b574c0b900ff966275d47d8ce348eb1cce69c73d5181f46619e6a1`, smoke evidence SHA-256 `48060c43911b0eaff84f48aa16a97e344485b74577a3bed4d2ae66313158ce40`, and release-certification pack SHA-256 `4c4b380679671150fdddea2cfa3cecd637f7a5b82a955856a8cb1613f2107f24`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Unified shipment-package handoff completed on 2026-08-04. A completed, reservation-bound pick wave can now create one deterministic local shipment package with real origin, dimensions, optional verified delivery promise/address, e-way requirement, and operator evidence. The package is recorded in the unified-order execution ledger and moves the order to `awaiting-dispatch`; invoicing, GST/e-way acknowledgement, carrier booking, dispatch, and Bakaloo writes remain separate. Full suite passes 225 files / 921 tests; TypeScript and ESLint pass. External provider, device, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.63`, build revision `ci-retail-0.1.63-unified-shipment-package-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.63 Setup.exe`. Schema revision is 24. Full suite passes 225 files / 921 tests; TypeScript and ESLint pass. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `9810d4deca52c6768348881dacbf92433d599560b577ddcb6b7c9a80a1815171`, installer manifest SHA-256 `94b3d640ec203aa1d833dc8c940797eb6298f524f34970da77263fe9f35f58fb`, smoke evidence SHA-256 `247289a867a0902dbf4056b45a072d5b4c7e92ae9089d22eeaf487646a1d56fb`, and release-certification pack SHA-256 `8b256d07b81d327329a60bd0bf9f305be1d43c1ff9f6cf0fbd73d81128648e5b`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Package custody completion completed on 2026-08-04. A unified package execution can now move from `created` to `packed` only through the existing shipment transition, with a separate operator, immutable packing evidence, and timestamp. Dispatch still requires its existing invoice, place-of-supply, carrier, vehicle/transport, and statutory gates. Full suite passes 225 files / 921 tests; TypeScript and ESLint pass. External provider, device, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.64`, build revision `ci-retail-0.1.64-unified-package-packed-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.64 Setup.exe`. Schema revision is 24. Full suite passes 225 files / 921 tests; TypeScript and ESLint pass. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `cae4a57cb8a5541931347c15a818b6cba0842ac07653fbf47d005ac07e6a3ee2`, installer manifest SHA-256 `472ecc1565cdfe5ad596866250fbc585e0893b53177a7215b9a64c026b42d08a`, smoke evidence SHA-256 `af7bddabb2d57db22584038c32aed51494f9cf293dfbda5f9d0d79439a38a56c`, and release-certification pack SHA-256 `2b37c32e8e27e3b5d279e7816d95cdff200fd0254beb5f2c3945c36a569b5549`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Dispatch-readiness handoff completed on 2026-08-04. A packed unified-order shipment can now enter `ready-to-dispatch` only after the existing issued-invoice and approved place-of-supply gates pass, with optional healthy carrier metadata, operator location, and explicit evidence. The transition is local custody evidence only; e-way acknowledgement, carrier booking, actual dispatch, and Bakaloo writes remain separate. Full suite passes 225 files / 921 tests; TypeScript and ESLint pass. External provider, device, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.65`, build revision `ci-retail-0.1.65-unified-dispatch-readiness-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.65 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `87fcf5d1b4195047bfc04ef9f301d4c31f12116ff2ac6c6ab3d3fbcf30a6b8c7`, installer manifest SHA-256 `ff54abb8e74e8b10c2f9a4180954d97c579d5fb73892d01481ba4bf96b2336a3`, smoke evidence SHA-256 `4e93b422b87d0255341cbc515ada568cbd037f43268d4df6308d2a453d1b0bce`, and release-certification pack SHA-256 `6e72e384b4ab8dd0158d8d9a948963c3776de3898b3af0a515dfe1462098d8f3`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Carrier handoff execution completed on 2026-08-04. A dispatch-ready unified order can now be handed to a carrier through a separate independent operator and explicit signed-manifest, scan-batch, or handover reference. The existing shipment transition enforces a healthy carrier, tracking/vehicle or transport particulars, packed reservation custody, and acknowledged e-way bill when required; stock is issued exactly once and the order moves to `awaiting-delivery`. This is local custody evidence only: carrier APIs, live tracking, delivery confirmation, and Bakaloo writes remain separate. Full suite passes 225 files / 921 tests; focused unified-order, inbox, and App tests pass 50 tests; TypeScript and ESLint pass. External provider, device, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.66`, build revision `ci-retail-0.1.66-unified-carrier-dispatch-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.66 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `e23c0f91b856966cc450adeca169ead935dac399bdbccce0f71dda3967b31ba3`, installer manifest SHA-256 `ba1c093fb543e4de60c7f8dc7607307a91c15f2ac2a285af565b88e07e49308d`, smoke evidence SHA-256 `d4934c300e301cb4269716e44b84e86eb28885977556de28db00c74a8d5d1da7`, and release-certification pack SHA-256 `433375af35c031de575f6ea771be8245a9634a5393ff15d3d90ee4f23e663823`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Unified delivery confirmation completed on 2026-08-04. A carrier-handoff order can now be confirmed delivered only by an independent operator, with a real proof-of-delivery reference, delivery location, optional recipient name, and delivery notes. The existing shipment transition records the delivered package and the canonical sales-order delivery evidence, while the unified order moves to `delivered`. RTO, returns, refunds, credit notes, and provider callbacks remain separate reconciliation boundaries; no external or Bakaloo write is fabricated. Full suite passes 225 files / 921 tests; focused unified-order, inbox, and App tests pass 50 tests; TypeScript and ESLint pass. External provider, device, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.67`, build revision `ci-retail-0.1.67-unified-delivery-pod-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.67 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `171f4d549ca399c564e2759b6bb8d4f56c79dd49d08ce4d0dbe7e32e7c62da12`, installer manifest SHA-256 `857cccf051b3cd5a4e4d2def153f1401a0d6ed122dbb97fcef9f584c45263328`, smoke evidence SHA-256 `f988ad3c4f3b3a738e29baf1077c8d7eb08a8e8777134d29e5e870c76112ee4c`, and release-certification pack SHA-256 `4f2c662fb57d67056bd8d2cc573c4f646fd0caf9939a8859dbb5bbacc695060f`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Evidence-only RTO reconciliation completed on 2026-08-04. An authoritative external `rto` status can now be closed locally only after an approved fulfilment mapping, carrier-dispatch evidence, independent maker/checker review, and four real references: carrier RTO, inventory custody/inspection, payment or refund, and GST/credit-note. The execution is deterministic and replay-safe, changes only the unified-order handling projection to `rto-reconciled`, and deliberately performs no stock receipt, refund, payment, GST, credit-note, carrier, or Bakaloo write. The inbox exposes the four-reference task in plain language and keeps the boundary visible. Full suite passes 225 files / 922 tests; focused unified-order/inbox/App tests pass 51 tests; TypeScript and ESLint pass. External provider credentials, physical-device evidence, signing, and independent review remain required.
Cache-safe Windows artifact: version `0.1.68`, build revision `ci-retail-0.1.68-unified-rto-reconciliation-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.68 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `c782e5e5662d32225fe637835e606c0857dffec3c9257024ad1393fff3662208`, installer manifest SHA-256 `b2a1b59c124fcb1aa4120518352df393e96cd5f8570846ae1066a0a12402652d`, smoke evidence SHA-256 `ce06e26f567da3407c309397042b52d949df9eb63f51d2613e2ae2e442d9aeec`, and release-certification pack SHA-256 `67573901d693c3f75391aab40b6576463b226f00671e5d466d558caad29eba82`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Unified return-settlement reconciliation completed on 2026-08-04. An external `returned` or `rto` order can now be linked to an approved local retail return, a completed cash/provider/store-credit settlement, and a `matched` GST credit-note workpaper. The boundary validates exact INR totals, active company/branch scope, source digest, open conflicts, RTO prerequisite evidence, and independent review across the return, settlement, tax, and omnichannel makers. It records a deterministic, replay-safe reconciliation projection only; it does not repeat stock receipt, refund, store-credit, GST, credit-note, carrier, or Bakaloo writes. The unified inbox now exposes simple selectors and real evidence fields, and clearly waits when any owning workflow is incomplete. Full suite passes 225 files / 923 tests; focused unified-order/inbox/App tests pass 52 tests; TypeScript and ESLint pass. External provider credentials, physical-device evidence, signing, and independent review remain required.
Cache-safe Windows artifact: version `0.1.69`, build revision `ci-retail-0.1.69-unified-return-settlement-reconciliation-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.69 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `644916221327a496ba522c503cb7d3e2fc072a5da9502e15cc99375bfdb25221`, installer manifest SHA-256 `4e7da3889dbf9f99a17d3b63290eca0312ab53d311c2fe9f605a9b29986448fc`, smoke evidence SHA-256 `555515d1dd38575cfd8d78991a548392cfe078d01d7203d04498e3a6a33882dc`, and release-certification pack SHA-256 `a132ab37cba242fd9ef0fb789c59243da60ce3a07e0a1d021d309af302c62b06`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Provider callback evidence completed on 2026-08-04. A dispatched unified order can now record a real carrier/provider callback event ID, normalized provider status, callback reference, and SHA-256 payload checksum in an append-only, source-digest-bound evidence register. Duplicate event replay is idempotent; the same provider event with a different checksum/status/reference is rejected as payload drift. Open order conflicts, stale source evidence, missing carrier handoff, placeholder checksums, and same-actor handoff/callback attestations are blocked. The callback is deliberately evidence-only: it never silently changes local shipment/order state, delivery proof, RTO, return settlement, stock, refund, GST, or Bakaloo. The unified inbox shows the latest callback and a simple evidence form while keeping manual governed custody actions separate. Full suite passes 225 files / 924 tests; focused unified-order/inbox/App tests pass 53 tests; TypeScript and ESLint pass. External provider credentials, physical-device evidence, signing, and independent review remain required.
Cache-safe Windows artifact: version `0.1.70`, build revision `ci-retail-0.1.70-unified-carrier-callback-evidence-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.70 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `b61116651d5d30246bc634bda8f6f57828d90a2c9e3ba527eb5cc7d71f1ec52d`, installer manifest SHA-256 `3ff870f9e976590c95fb5ef2391067d73f5ddba8c76e2dd531896a012be36ebe`, smoke evidence SHA-256 `df2e6810994ca95940afca3d38d1d87ddd456090709c095b761f600a9b2f4689`, and release-certification pack SHA-256 `21dc384ed09654472949ead6996427381d5316c2d5f976ab1a5a33cbf87c6d15`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

USB Web Serial command execution completed on 2026-08-04. A prepared, current-profile-bound USB command can now be sent through an operator-authorized Web Serial port from the device transport workbench. The renderer enforces the prepared payload SHA-256 before opening the port, writes a bounded payload, reads a bounded response, closes the port, and records response checksum/byte-length evidence through the existing independent acknowledgement boundary. Zero-byte responses are recorded as failures; no native driver, Bluetooth path, live activation, or certification is fabricated. Focused serial and device-panel tests pass (15 assertions); TypeScript and ESLint remain clean. Physical device, native driver, provider, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.71`, build revision `ci-retail-0.1.71-usb-web-serial-command-boundary-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.71 Setup.exe`. Schema revision is 24. Full suite passes 225 files / 927 tests. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `a801275a9dd1347ec55a2c1e2ddcc0fbc73913dc5eff538aa505f62d56fc35bb`, installer manifest SHA-256 `f5f68e7d8657626ed8cbcdf26c386b6db0dcd1eddb2d7fbe342ce899da464bd0`, smoke evidence SHA-256 `00dd3517fbd9c52f23f773a086dfbb396820b44f6e17590a57c0755e4febfbb`, and release-certification pack SHA-256 `890d30cf037368b8ae850fdd3d9435aa3872ab75801037dc0827e99113a8a057`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Settlement exception triage completed on 2026-08-04. The existing marketplace settlement-readiness exceptions now have a deterministic, read-only decision projection: high-value internal blockers rank first, every item names its owner (Finance, Tax, Operations, Fulfilment, or Provider), and external certification holds are kept separate from INR exposure. The Provider control plane shows one plain-language “What blocks money close” queue without creating a second exception store or mutating accounting, settlement, GST, provider, or Bakaloo state. Full suite passes 225 files / 928 tests; TypeScript and ESLint remain clean. Provider credentials, native/Bluetooth hardware, signing, and independent review remain required.
Cache-safe Windows artifact: version `0.1.72`, build revision `ci-retail-0.1.72-settlement-exception-triage-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.72 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `8381864fe2803afac96191bcb48b14f84aa1d668be4039a7608e2df81b9ff9fe`, installer manifest SHA-256 `287bfde5a2e8188a2274c09ef1bf946791fbc0e19a2721a040470cca93a37fae`, smoke evidence SHA-256 `1ff33f52c5c980b9befea9700cafa86c2a6acdf79599732791f0dd894b5c4396`, and release-certification pack SHA-256 `0aea0bcdabf71ee5a639ec20e60b56c04c218e8212115217cf4291fc30373979`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Offline recovery readiness depth completed on 2026-08-04. Store execution readiness now detects stale queued/syncing sales, missing append-only recovery journal coverage, missing outage/recovery evidence, and duplicate transaction keys that could indicate replay. It reports deterministic next actions and keeps the boundary read-only; synchronization, conflict resolution, stock, GST, payment, restore, and provider writes remain governed by their existing workflows. Full suite passes 225 files / 929 tests; TypeScript and ESLint remain clean. Hardware, provider, signing, and independent-review evidence remain required.
Cache-safe Windows artifact: version `0.1.73`, build revision `ci-retail-0.1.73-offline-recovery-readiness-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.73 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `f055faa68f7ffd8ea96490588c3253437c3977c8b11e07860428a97dfc35d645`, installer manifest SHA-256 `72669c997f5a202111c337fa8448f777ad880a55007a1e24cef64d330e00f0ec`, smoke evidence SHA-256 `b57d63c937870003d0a4ce7a43e2e202441a1cd0d127eba778bfbc2239698646`, and release-certification pack SHA-256 `e30150cc4ececc24d163f09e7d32962959a3a74a4c8964b4fcc28720cf323db0`. The release remains a hold until code signing, provider/device certification, and independent review are supplied.

Web Bluetooth diagnostic boundary completed on 2026-08-04. Bluetooth adapter profiles now validate and retain an explicit service and characteristic UUID, with a `web-bluetooth-diagnostic-only` boundary distinct from native-driver-required activation. The device transport workbench can bind a prepared Bluetooth command to the current approved profile, ask the operator to select one GATT device, write one bounded payload, read one bounded response, close the connection, and record response checksum/byte-length evidence. A cancelled picker, missing response, unsupported runtime, or timeout remains failed/unsupported evidence; no native Bluetooth driver, production pairing, live activation, payment, stock, or Bakaloo write is fabricated. Full suite passes 226 files / 935 tests; TypeScript and ESLint pass. Provider credentials, physical-device/native-driver certification, signing, and independent review remain required.
Cache-safe Windows artifact: version `0.1.74`, build revision `ci-retail-0.1.74-web-bluetooth-diagnostic-boundary-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.74 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `5b14ce7ab7487285eac86bc137e057a6cd0005a12c53c66a339192ed1cd8d28a`, installer manifest SHA-256 `0d54abac350dacd6b7b02acd87e20066dd7d0478fba43c315331cd07ad08ccf0`, smoke evidence SHA-256 `3a1be5d63bac0ef2e75f2f9b65861b94f4044570fe69c4324436f886be79f1fb`, and release-certification pack SHA-256 `e754cbe7e3290ce261295e02d4befa71cb80f2e235ce2a4ffa48ab04f73fd44b`. The release remains a hold until code signing, provider/device/native-driver certification, and independent review are supplied.

Native device bridge evidence handoff completed on 2026-08-04. Prepared USB/Bluetooth commands bound to a `native-driver-required` profile now have a plain-language evidence form in the device workbench. The form is shown only for the current approved profile/version, requires a different operator, uses the approved driver code/version, validates response protocol/checksum/length through the existing main-process domain boundary, and keeps failed or unsupported bridge results explicit. It does not install a driver, pair hardware, claim a mechanical action, or activate a profile; native bridge implementation and hardware acceptance remain external certification work. Full suite passes 226 files / 936 tests; TypeScript and ESLint pass. Provider credentials, physical-device/native-driver certification, signing, and independent review remain required.
Cache-safe Windows artifact: version `0.1.75`, build revision `ci-retail-0.1.75-native-device-bridge-evidence-2026.08.04.1`, unsigned installer `out/make/squirrel.windows/x64/Epic BOS-0.1.75 Setup.exe`. Schema revision is 24. Packaged smoke, smoke-evidence binding, multi-artifact checksum verification, and release-certification pack generation passed. Installer artifact SHA-256 `900f2b8403fe2016f296d5f4eed248dc3f6aee97a3b12f50b8b04ad2abb60b4a`, installer manifest SHA-256 `4698679feb0c8d572df48cb393d7dec9a8cb6668c6708692e2812ab56963c444`, smoke evidence SHA-256 `7bcd0a6dbfd2f5aed444993e211e7f6034af4f4fe38337dfc07f14940ce223ad`, and release-certification pack SHA-256 `9917e893e0f0f7b3bf842cb02986bd6727e683910f279a57075d2009733d41b8`. The release remains a hold until code signing, provider/device/native-driver certification, and independent review are supplied.

Premium UI system and navigation wave completed on 2026-08-04. The Electron renderer now uses one persisted blue-white Executive Dashboard / Minimal Swiss contract across the retail shell and legacy workbenches. The left rail stacks Home, Sell, Stock, Deliver, Customers, Money, Insights, and Setup; each reveals labelled submodules in-place, while authorised users can disclose Command, CRM, Sales, Finance, Operations, People, Service, Intelligence, and Settings. Shared tokens normalise panels, forms, buttons, focus, empty/error/loading states, responsive breakpoints, reduced motion, and the single scroll-owner contract. Reusable source-linked SVG line, bar, and donut charts expose accessible labels, visible legends, and truthful empty states; Home and Insights now show governed store pulse visuals without fabricated demo data. Focused navigation/chart/insights tests and the full App interaction suite pass; TypeScript and ESLint pass. Next packaged build is 0.1.76. The release remains a hold until packaged visual review, code signing, provider/device/native-driver certification, and independent review are supplied.
Cache-safe Windows UI artifact: version `0.1.76`, build revision `ci-retail-0.1.76-premium-ui-system-2026.08.04.1`, unsigned installer `out/ui-0.1.76/make/squirrel.windows/x64/Epic BOS-0.1.76 Setup.exe`. Schema revision is 24. Full suite passes 227 files / 939 tests; packaged launch smoke and smoke-evidence binding passed. Installer artifact SHA-256 `f48ffbeef9b5f70df5680737031a56471650d20e089f3a07af73db3653b722fe`, installer manifest SHA-256 `2bc5c06c978451a0b7530d49a22b194fbf3505f56a2ee8b82df16654eb10328`, and Windows smoke evidence SHA-256 `e1a6852d3fa3d9419498399008d201d525de1a242955c07f0f37d9b92d858b8d`. The release remains unsigned and on hold until packaged visual review, code signing, provider/device/native-driver certification, and independent review are supplied.

Retail product-truth and navigation hardening began on 2026-08-04. The customer-facing first-run flow now provisions a clean workspace only; fictional sample records remain an internal test/demo seam rather than an operator choice. Existing unknown workspaces are not silently deleted: the known legacy demo still requires a verified backup and explicit reset, while unclassified data stays blocked from automatic external writes. The simple retail front doors now hand off to their detailed governed workbenches, and every expanded rail submodule has a concrete owning destination instead of reopening the same overview. A product-truth audit and eight-phase delivery SOP now live in `docs/RETAIL_PRODUCT_TRUTH_AUDIT_2026-08-04.md`. TypeScript and ESLint pass; focused renderer/navigation verification passes 39 tests. Full human UAT, packaged visual review, real data reconciliation, provider/device certification, signing, and independent review remain required before a production-ready claim.

Retail product-truth Phase 1 hardening expanded on 2026-08-04. The normal operator renderer no longer contains the unreachable generic demo scenarios, fake readiness panels, client handoffs, mock communications, or sample import queues; the protected backup-first legacy-reset path remains. Specialist extensions now fail closed from the signed-in policy, while direct retail work stays in the left rail. POS vouchers are now governed at the atomic checkout boundary with scoped code/version validation, GST-safe discount allocation, immutable sale evidence, one-time usage consumption, and offline replay revalidation; no local "applied" state remains. Direct exchange regression coverage now proves independent approval, exact top-up, replacement sale, return-credit settlement and cost evidence. POS keeps the full tender list after a completed sale. The first real packaged Electron E2E journey now proves visible owner enrollment, clean workspace provisioning, graceful close, SQLite integrity/migration/credential/bootstrap-guard evidence, relaunch and visible sign-in against an isolated temporary profile. Current verification: `pnpm.cmd typecheck` pass; `pnpm.cmd lint` pass; full suite **227 files / 952 tests** pass; `pnpm.cmd test:e2e:electron` **1/1** pass. This created no new distributable installer and does not claim live Bakaloo migration, provider/device certification, signed release, or completed human UAT.

Fresh local Windows build created on 2026-08-05. The stale default `out/` release folder and `.vite/` renderer cache were cleared before packaging; no Epic BOS database, backup, or workspace data was removed. The resulting unsigned installer is version `0.1.77` at `out/make/squirrel.windows/x64/Epic BOS-0.1.77 Setup.exe`, with SHA-256 `98a8d93eb1269bc49c71c2f6f646a0c5dadd61ace9f4ec94e96de187737bdec2`. This is a clean local build of the previously verified source, not a signed production release; code signing and the remaining external certification/human UAT gates are still required.
