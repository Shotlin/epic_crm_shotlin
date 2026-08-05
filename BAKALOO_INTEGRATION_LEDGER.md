# Bakaloo-inspired integration ledger

## Product boundary

Epic BOS is the canonical Electron, local-first business operating system.
`shotlin085/bakaloo-dashboard` is a useful reference for retail-commerce
operations, but it is not a second application to embed, deploy, or fork into
Epic BOS.

The source repository does not include a licence file. Its code, brands,
visual assets, and copy are not copied into this project. Instead, this ledger
records the distinct Epic BOS implementations of useful interaction patterns:
our own domain model, desktop security boundary, India-first language, and
governed data sources remain authoritative.

## Implemented patterns

| Reference pattern | Epic BOS implementation | Evidence boundary |
| --- | --- | --- |
| Executive KPI dashboard | India operating pulse with INR pipeline, billed value, receivables, liquidity, and operational signals | Protected metrics remain protected; no substituted zeroes |
| Unified attention queue | Live governed control tower projects CRM, approvals, collections, inventory, warehouse, payroll, and service records | No static demo rows, browser-only acknowledgement, or fake resolution action |
| Product demand analysis | Commerce intelligence separates pipeline interest, non-cancelled sales orders, and issued taxable billing | Pipeline is never presented as booked revenue |
| Customer concentration | Separate customer rankings for pipeline, billing, and receivables | Party-master identity is labelled; unmatched identities are not silently merged |
| Commerce exception desk | A live, filterable exception workbench derives fulfilment, inventory, collections, approval, and service exceptions from scoped Epic BOS records and routes each one to its accountable workbench | The queue fails closed on scope mismatch, never manufactures rows, and never mutates or resolves a record itself |
| Period comparison | Commerce Performance has explicit this-month, last-month, and inclusive custom India/Kolkata business-date views | Orders, issued billing, GST, and recorded collections remain distinct evidence streams |
| Collection and settlement visibility | Collections Cash Health separates receipts, applied cash, unapplied cash, receivable ageing, disputes, bank matching, and supplier settlement exceptions | A local receipt is not presented as external bank or payment-provider settlement proof |
| Cash reapplication | A recorded, unreconciled receipt can be allocated across same-customer open receivables with allocation evidence | Its original draft payment journal is reclassified in place; no duplicate receipt or journal is created |
| Cash-on-delivery visibility | An India-only COD custody chain joins the governed delivery promise, package, carrier, receivable, carrier collection, remittance, and already reconciled bank evidence in one Electron workbench | Handover, delivery tracking, carrier collection, remittance, and bank matching are distinct facts; the desk never calls a carrier API, fabricates cash, or creates an accounting entry |
| Retail/POS readiness | Barcode, GST/HSN, payment-reconciliation, and return gates for actual sales orders | UPI/card settlement remains provider evidence, not a fabricated local result |
| Multi-shop operational scope | Company, branch, warehouse, zone, bin, and price-list controls | All projections use the active governed company/branch scope |

Every card routes to the source workbench that owns its mutation. The desktop
dashboard does not introduce a second browser session, an ungoverned API, or
a duplicate source of truth.

## India-first rules

- INR, `en-IN`, `Asia/Kolkata`, April-March financial years, GST, state codes,
  and six-digit PIN-code language are the default operating context.
- Fresh CRM and Party Master reference data uses fictional Indian businesses,
  Indian legal-entity conventions, `+91` phone numbers, Indian states, and
  six-digit PIN codes.
- Fresh kernel state uses a neutral India starter identity while preserving
  durable technical scope IDs. Existing companies are never auto-renamed.
- International customers, ISO countries, FX, export, SEZ, customs, and
  foreign-currency workflows remain available when explicitly evidenced.
  India-first does not mean India-only data handling.

## Next implementation waves

1. **Fulfilment extensions**: optional delivery-slot capacity, dispatch
   capacity, and RTO/restoration controls. COD custody is now delivered; any
   carrier fee, refund, wallet, coupon, or consumer checkout capability stays
   a separate governed extension rather than an assumed core workflow.
2. **Exception workbench extensions**: saved filters and version-safe bulk
   handoffs for sales orders, inventory, collections, and service work. Any
   mutation stays in its owning workbench with audit records and approval
   policy.
3. **Operational report packs**: exportable, scoped reports built from Epic
   BOS semantic metrics and evidence checks rather than unverified dashboard
   totals.
4. **Provider conformance**: certified GSP/IRP, banking, payroll, messaging,
   and logistics adapters once the selected providers supply credentials and
   sandbox evidence.

## Explicit non-goals

- No copy of Bakaloo source, assets, brand, copy, Next.js routes, Axios/JWT
  browser authentication, Fastify dependency, default Kolkata map, or grocery
  navigation.
- No new ungoverned backend. Electron main-process persistence, preload APIs,
  session controls, audit trail, and tenancy scope remain authoritative.
- No claim that an API-connected dashboard proves a certified production
  provider integration. Epic BOS features are implemented only against its own
  verified contracts.

## Bakaloo retail command-centre delivery â€” 2026-08-03

The first operator-facing Bakaloo retail slice is now implemented in the
Electron desktop application.

| Retail need | Epic BOS implementation | Guardrail |
| --- | --- | --- |
| Clean first screen | A white-and-blue **Bakaloo Retail Command Centre** leads with six simple actions: POS, online orders, stock, delivery, cash, and customers | Every action routes into its existing accountable Epic BOS workbench; the landing view never creates a second source of truth |
| Truthful visual analytics | Today’s INR sales, pending online order value, stock/expiry attention, delivery promises, cash-shift variance, customer loyalty, and channel queue are calculated from the governed local revenue projection | Empty stores show an explicit empty state, not fabricated KPI values, delivery pins, or sample revenue |
| First-store setup | A short counter, catalog, online-channel, and loyalty checklist explains the next safe action in ordinary language | Credentialed channels remain off until their configured connector and evidence exist |
| Legacy demo removal | A typed, backup-first cleanup recognises only the full cryptographic fingerprint of the known generic USD demo, atomically replaces its five state documents, and retires their superseded local audit/outbox evidence before recording the clean starter evidence | It refuses changed or additional records, retains the signed-in owner/session, and cannot delete a real workspace; the verified backup remains the historical copy |
| Premium but simple UI | Reusable white surfaces, accessible blue focus/action states, tabular INR figures, responsive grids, one primary scroll owner, 44px actions, and reduced-motion support | Technical controls stay available under a collapsed Advanced controls section rather than being removed or presented as the main retail workflow |
| Delivery control | A fulfilment-first Delivery Control Centre groups Indian PIN-code serviceability, delivery promises, packages, COD custody, returns/RTO, and online-order exceptions into clear linked actions | It deliberately shows only local governed evidence. Live carrier maps, GPS, routing, and ETAs remain absent until a credentialed provider integration supplies certified evidence |

The next retail slice is a dedicated Delivery Control Centre built on the
existing serviceability, fulfilment, COD-custody, returns/RTO, and
omnichannel-order evidence. It will add map/provider adapters only through a
credentialed, auditable integration boundary; it will not invent live GPS,
route, or carrier acknowledgements locally.
