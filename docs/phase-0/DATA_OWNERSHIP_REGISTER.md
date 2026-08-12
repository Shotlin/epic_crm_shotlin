# Bakaloo Retail Business OS — Data Ownership Register

This register assigns one future authoritative owner per fact. “Current owner” records the migration source, not a claim that its controls are sufficient.

| Entity / fact | Current owner / source | Target canonical owner | Store Edge role | Notes |
| --- | --- | --- | --- | --- |
| Tenant, legal entity, outlet | Epic BOS local kernel; Bakaloo shops | Retail Hub identity/organisation service | Cached scoped profile | Separate tenant, company and outlet IDs. |
| Users, staff assignments, roles | Bakaloo users/shop_staff; Epic BOS local roles | Retail Hub identity/policy service | Authenticated session + scoped grant cache | Legacy ADMIN is not an acceptable canonical scope. |
| Product, variant, category, UOM, barcode | Bakaloo products/categories; Epic BOS catalog | Retail Hub catalog | Read cache and sale-time snapshot | Preserve version/effective dates. |
| Outlet price, promotion, voucher eligibility | Bakaloo shop_products/offers; Epic BOS pricing | Retail Hub pricing/promotions | Signed/cacheable sell-time rule snapshot | POS records the exact rule/version used. |
| Physical stock and movement | Bakaloo shop_products/stock_movements; Epic BOS inventory | Store Edge for local physical events, Retail Hub for reconciled network truth | Authoritative at a store while offline | No direct overwrite of stock balances. |
| Purchase, GRN, transfer and count | Epic BOS local workflows | Retail Hub after accepted sync | Captures maker/checker physical evidence | Custody and discrepancy evidence are immutable facts. |
| Counter shift, cash drawer and tender | Epic BOS local POS/cash workflows | Store Edge until reconciled into Hub ledger | Local authoritative shift evidence | Hub receives an idempotent close/reconciliation event. |
| POS sale and receipt | Epic BOS local POS | Store Edge event plus Hub unified order/financial event | Authoritative local receipt/evidence | Server acknowledgement does not replace local proof. |
| Web/app/WhatsApp/marketplace order | Bakaloo backend orders | Retail Hub unified order service | Fulfilment/pick/dispatch status mirror | Existing order JSON/order_items duplication must be resolved. |
| Customer, address, consent | Bakaloo backend / Epic BOS party | Retail Hub customer and consent service | Scoped customer cache | Consent is purpose/version/channel specific. |
| Loyalty, wallet, gift card | Bakaloo wallet; Epic BOS loyalty | Retail Hub append-only loyalty/wallet ledger | Uses signed available-balance snapshot | Redemption is idempotent and reversal-based. |
| Payment, refund, settlement | Bakaloo payments/shop transactions; Epic BOS finance | Retail Hub financial ledger/reconciliation | Captures tender/evidence only | One refund contract, provider truth separated from operator evidence. |
| GST, invoice/e-way/e-invoice evidence | Epic BOS statutory boundary; Bakaloo invoices | Retail Hub statutory evidence service | Produces local invoice/tender facts | No filing claim without GSP/IRP response evidence. |
| Rider, route, delivery/POD/COD | Bakaloo delivery/riders; Epic BOS delivery/COD | Retail Hub delivery service | Store handoff/pick evidence | Location is transient, consented, role-scoped and freshness-labelled. |
| Storefront theme/content | Bakaloo Dashboard/backend | Retail Hub content/versioning service | None | Preview assets are never operating data. |
| Reports, aggregates, AI recommendations | Both applications | Hub analytical projections | Local read cache | Projections are rebuildable; charts disclose source/freshness/scope. |
| Audit, approval and release evidence | Epic BOS local stores; Bakaloo logs | Event owner plus Hub evidence registry | Local append-only audit mirror | Evidence is immutable, checksum-linked and retention governed. |

## Ownership enforcement rule

An application may cache, project, read or prepare a record it does not own. It may not silently become an alternate writer. Every cross-runtime change travels through a versioned command/event, idempotency key, scope check, audit record and reconciliation state.
