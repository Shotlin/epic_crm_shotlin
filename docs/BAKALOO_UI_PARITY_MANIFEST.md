# Bakaloo UI Parity Manifest

Status legend: **Captured** = live read-only behaviour inspected; **Source** = pinned source route/components inspected; **Mapped** = Epic destination decided; **Implemented** = real Epic UI and domain wiring exist; **Verified** = tests plus visual/interaction certification. No route is marked verified merely because it has a button.

| Bakaloo route | Captured | Source | Epic destination | Current state |
| --- | ---: | ---: | --- | --- |
| Dashboard | Yes | Yes | Home/dashboard | In progress — Bakaloo shell, reporting-period selector, ten governed KPIs, cart-recovery unconfigured state, ordered decision visuals, low-stock alerts and evidence-only rider map are implemented. Live cart import, full visual capture comparison and role/empty/error certification remain. |
| Orders | Yes | Yes | Orders + unified order inbox | In progress — the Sell rail now opens a compact, read-only unified order queue using governed channel, handoff, reservation and exception projections. Lifecycle writes remain in the accountable commerce/fulfilment workbench; visual capture, role/error certification and real Hub import remain. |
| Settings / Fees | Yes | Yes | Setup / commercial policy | Planned parity |
| Settings / Tip Presets | Yes | Yes | Setup / checkout policy | Planned parity |
| Settings / Payment Offers | Yes | Yes | Money / payment offers | Planned parity |
| Settings / Payments | Yes | Yes | Money / payment configuration | Planned parity |
| Settings / Wallet | Yes | Yes | Money / wallet policy | Planned parity |
| Settings / Order Notifications | Yes | Yes | Setup / order communications | Planned parity |
| Settings / Product Suggestions | Yes | Yes | Products / merchandising | Planned parity |
| Settings / Delivery Timer | Yes | Yes | Deliver / SLA policy | Planned parity |
| Settings / Pincode Mapping | Yes | Yes | Deliver / serviceability | Partial domain, planned parity |
| Settings / Store Hours | Yes | Yes | Setup / store policy | Planned parity |
| Settings / Delivery Calendar | Yes | Yes | Deliver / slots | Planned parity |
| Settings / App Version | Yes | Yes | Setup / release | Partial domain, planned parity |
| Settings / Legal Pages | Yes | Yes | Setup / legal content | Planned parity |
| Products | Yes | Yes | Products / catalog | In progress — the Stock rail opens the compact, evidence-only stock workspace for product/variant availability, SKU, batch, expiry, replenishment and channel-demand review; its Stock control entry stays on that same simple surface, while Replenishment and Purchasing open their exact review tabs. Catalog and procurement writes remain in accountable workbenches; visual capture, role/error certification and live Hub import remain. |
| Abandoned Carts | Yes | Yes | Customers / recovery | Planned integration |
| Categories | Yes | Yes | Products / catalog taxonomy | Partial domain, planned parity |
| Customers | Yes | Yes | Customers / Customer 360 | Partial domain, planned parity |
| Riders | Yes | Yes | Deliver / dispatch | Partial domain, planned parity |
| Area Segments | Yes | Yes | Deliver / service areas | Planned integration |
| Shops | Yes | Yes | Shops / branches | Partial domain, planned parity |
| Coverage Map | Yes | Yes | Deliver / coverage map | Partial domain, planned parity |
| Shop Products | Yes | Yes | Products / branch assortment | Partial domain, planned parity |
| Shop Financials | Yes | Yes | Money / branch finance | Partial domain, planned parity |
| Shop Transactions | Yes | Yes | Money / transaction evidence | Partial domain, planned parity |
| GSTR-1 | Yes | Yes | Money / GST workpapers | Partial domain, planned parity |
| Coupons | Yes | Yes | Customers / vouchers | Partial domain, planned parity |
| Purchase Limits | Yes | Yes | Commerce / purchase controls | Planned integration |
| Customer Segments | Yes | Yes | Customers / segmentation | Partial domain, planned parity |
| First-Time Offers | Yes | Yes | Customers / offers | Planned integration |
| Cart Milestones | Yes | Yes | Customers / promotion policy | Planned integration |
| Wallet & Refunds | Yes | Yes | Money / wallet and returns | Partial domain, planned parity |
| Notifications | Yes | Yes | Customers / communications | Partial domain, planned parity |
| Reviews | Yes | Yes | Customers / reviews | Planned integration |
| Analytics | Yes | Yes | Insights / retail analytics | In progress — executive sales/margin and Stock & expiry have compact, source-backed drill-downs. Outlet comparison has an explicit unavailable state until isolated store data is connected and reconciled. |
| Banners | Yes | Yes | Setup / storefront content | Planned integration |
| Tutorials | Yes | Yes | Setup / operator guidance | Planned integration |
| Activity Log | Yes | Yes | Setup / audit evidence | Partial domain, planned parity |
| Customer Activity | Yes | Yes | Customers / timeline | Partial domain, planned parity |
| Team & Roles | Yes | Yes | Setup / access control | Partial domain, planned parity |
| Themes | Yes | Yes | Setup / storefront theme | Planned integration |
| Theme Tabs | Yes | Yes | Setup / storefront navigation | Planned integration |

## Required verification per row

Before changing a row to **Verified**, record: implemented route, governed data source, loading/empty/error state, HQ/store context, permission check, dark mode, keyboard path, 1366×768 + 1440×900 + 1600×1000 visual comparison, focused E2E result and no unmatched reconciliation impact.
