# Epic Capability to Bakaloo V4 Operating Model Map

This is the Phase 3 capability audit for the pinned V4 transformation. It maps relevant Epic BOS truth and controls to the Bakaloo-first operator experience; it does **not** imply visual parity or production certification.

## Evidence basis

- **Domain modules inspected:** 143 tested domain modules under `src/domain/`.
- **Renderer workspaces inspected:** 75 TSX workspaces/panels under `src/renderer/`.
- **Persistence and security inspected:** SQLite WAL database, checksum-protected migrations, durable state documents, audit ledger, outbox, encrypted attachments/provider secrets/MFA material, protected backup/restore drills.
- **Boundary inspected:** typed preload bridge and main-process IPC handlers; no renderer receives direct database access.

## Target navigation model

| Operator rail | Bakaloo routes / experience | Epic truth retained underneath |
| --- | --- | --- |
| Home | `/dashboard`, `/store/dashboard`, `/hq/dashboard` | Retail command centre, channel health, executive pulse, governed anomaly queue |
| Sell | `/orders`, `/orders/new`, `/refund-requests`, `/abandoned-carts` | POS, receipts, return/exchange, order-to-cash, omnichannel orders, commerce conflicts, cash shifts |
| Stock | `/products`, `/products/*`, `/categories`, `/shop-products`, `/store/inventory*` | Catalog, variants, UOM, barcodes, bins, batches, expiry/FEFO, valuation, counts, replenishment |
| Deliver | `/riders`, `/area-segments`, `/hq/coverage-map`, `/store/orders` | Delivery, pincode serviceability, rider evidence, COD custody, fulfilment, maps boundary |
| Customers | `/customers`, `/customer-*`, `/coupons`, `/first-time-offers`, `/cart-milestones`, `/reviews` | Party/CRM, consent, segments, loyalty, promotions, wallet/refunds, engagement and support evidence |
| Money | `/shop-financials`, `/shop-transactions`, `/settings/fees`, `/settings/payments`, `/settings/payment-offers`, `/wallet`, `/hq/finance/gstr1` | General ledger, collections, settlements, bank matching, GST/statutory workpapers, financial close |
| Insights | `/analytics`, `/shop-*`, `/store/reports`, `/hq/reports` | Semantic metrics, retail reports, forecasting, loss prevention, decision intelligence, saved views |
| Setup | `/settings/*`, `/shops/*`, `/team`, `/themes*`, `/banners`, `/tutorials`, `/activity-log`, `/hq/audit-logs` | Kernel/RBAC, approvals, store setup, integrations, device profiles, sync/offline, backup/recovery, release evidence |

## Capability inventory and disposition

| Epic capability family | Source of truth | Bakaloo visual destination | V4 disposition |
| --- | --- | --- | --- |
| Tenant, company, branch, role, field policy, maker/checker, audit | `kernel`, `ipc-authorization-policy`, `kernel-store` | Shops, Team, Activity Log, HQ audit | Preserve; expose simple role-aware views, never duplicate access truth in renderer |
| Authentication, sessions, MFA, lockout | `auth-service`, encrypted MFA records | Profile / Setup | Preserve; no API secrets or session material in UI data models |
| Catalog, brands, categories, variants, UOM, pricing, GST | `retail-catalog*`, `commercial`, `revenue-ops` | Products, Categories, Shop Products | Rebuild in Bakaloo list/detail/form language |
| POS, checkout, tender, cash shift, receipts, returns/exchanges | `retail-pos`, `retail-returns`, `retail-exchange`, `retail-tender-settlement` | Sell, Orders, Refund Requests, Money | Rebuild sales flow; keep approval, receipt and settlement evidence |
| Unified order, channels, reservations, cancellation/RTO | `retail-unified-order-*`, `retail-commerce*`, `omnichannel-inventory` | Orders, Abandoned Carts, Store Orders | Make one order truth; external channels remain adapter-bound until certified |
| Inventory, warehouse, scan, batch, serial, expiry, count, transfer | `inventory-warehouse`, `warehouse-*`, `retail-interbranch` | Stock, Store Inventory, Shop Products | Rebuild stock read models and drillthrough; preserve immutable movement/approval boundaries |
| Procurement, supplier, GRN, RFQ, landed cost, three-way match | `procurement`, `supplier-*`, `retail-ocr-*` | Stock purchase extension / Setup supplier controls | Keep in Stock’s contextual subnavigation; do not crowd default store route |
| Customers, CRM, consent, engagement, visits, loyalty | `party`, `crm*`, `retail-customer-ops`, `retail-loyalty-promotions`, `customer-engagement` | Customers, Customer Activity, Segments, Offers, Reviews | Build Customer 360 first; use consent as a visible guard for communications |
| Wallet, refunds, credit, dunning, disputes | `collections-finance`, `retail-credit-note`, `retail-settlement-*` | Wallet, Refund Requests, Money | Retain evidence and approval flows; no implied live payout status |
| Delivery, serviceability, coverage, riders, POD, COD | `delivery*`, `pincode-serviceability`, `retail-delivery-*`, `cod-custody` | Delivery, Riders, Area Segments, Coverage Map | Use governed evidence map; do not fabricate GPS/ETA without live adapter data |
| Finance, GST, GL, reconciliation, close | `finance-*`, `treasury`, `statutory-control`, `general-ledger-store` | Money, Financials, Transactions, GSTR-1 | Preserve double-entry/audit evidence; all figures must trace to journals or explicit unavailable state |
| Reporting, semantic metrics, forecasts, anomalies, AI | `semantic-metrics`, `retail-reports`, `retail-forecasting`, `decision-intelligence`, `ai-recommendations` | Analytics, reports, dashboard | Rebuild as governed read models under Phase 4 and 14 |
| Offline queue, sync, conflict, cutover | `retail-offline-sync`, `retail-cutover`, `production-sync-monitoring` | Setup / Retail Hub | Keep local-first queue and explicit conflict state; no silent overwrite |
| Devices: scanner, printer, drawer, scale | `retail-device-*`, `retail-escpos`, `retail-device-transport` | Setup / Devices, Sell diagnostics | Keep profiles/readiness now; real USB/Bluetooth device certification stays external |
| Providers, webhooks, statutory, marketplace, release | `provider-*`, `webhook-*`, `statutory-*`, `release-*`, `backup-service`, `restore-drill` | Setup / Integrations, Recovery & release | Expose readiness/evidence; certified submission requires actual provider accounts and test evidence |
| HR, assets, manufacturing, projects, service | `workforce*`, `payroll`, `assets-maintenance`, `manufacturing*`, `project-*`, `service-*` | Advanced role-gated extension, not the default retail rail | Preserve in domain and governed advanced routes; intentionally defer from the retail-first daily flow |

## Architecture findings to repair during later phases

1. **Renderer coupling is oversized.** `src/renderer/App.tsx` imports many legacy workbenches directly. Phase 6 must establish a route registry, feature boundaries and lazy loading; business logic stays in domain/main layers.
2. **There are duplicate presentation surfaces.** Legacy blue/generic panels and the prior command centre must be isolated or replaced by V4 route-specific surfaces—not left as competing homes.
3. **Persistence is mature but local.** SQLite and migration protection are appropriate for local-first operation. Retail Hub/cloud sync must remain a separate authenticated boundary, not a browser-like direct database connection.
4. **Current source has broad capability but incomplete retail-first mapping.** Every V4 route is listed in `BAKALOO_UI_PARITY_MANIFEST.md`; delivery should be tracked as a mapping and certification effort, not as generic feature claims.

## Phase 3 exit assessment

Every relevant Epic capability is now either mapped to a Bakaloo-first retail destination or explicitly retained as an advanced role-gated extension. Visual implementation, metric truth, P0 security audit and route certification remain future phase work.
