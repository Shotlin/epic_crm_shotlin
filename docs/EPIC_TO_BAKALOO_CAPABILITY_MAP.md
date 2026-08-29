# Epic-to-Bakaloo Capability Map

This map retains every governed Epic capability. A Bakaloo visual route is a presentation target, never a replacement domain authority.

| Epic governed capability | Bakaloo-style presentation target | Domain ownership | Parity decision |
| --- | --- | --- | --- |
| POS, shifts, tender, receipts | MAIN / Point of Sale; Orders | Epic Store Edge | Retail Sell front door is implemented with a governed, price-ready product search/category projection; checkout writes remain in the role-aware POS workbench. |
| Returns, exchanges, credit notes | Orders / Returns & Exchanges | Epic Store Edge + finance | Add nested Orders route with approval evidence |
| Order intake, reservation, pick/pack/dispatch | Orders | Retail Hub projection + Epic fulfilment | Reconcile channel events before action |
| Catalog, variants, barcode, price, GST/HSN | Products + Shop Products | Epic catalog/inventory | Extend master/shop tabs progressively |
| Bins, batches, expiry, FEFO, serials, counts | Products / Retail Operations | Epic inventory ledger | Add role-specific Stock extensions |
| PR, PO, GRN, supplier management | Shops / Retail Operations | Epic procurement | New Bakaloo-style extension routes |
| Warehouse and inter-branch transfer | Shops / Shop Products | Epic inventory ledger | Add transfer, receiving and custody views |
| Customer 360, consent, loyalty, credit | Customers | Epic party/CRM/loyalty | Drawers/tabs preserve privacy scope |
| Voucher engine and campaigns | Coupons, Notifications, Cart Milestones | Epic growth/loyalty | Never hardcode economics |
| Rider, serviceability, POD, COD, RTO | Riders, Area Segments, Coverage Map | Epic delivery + provider evidence | Map marks freshness/staleness truthfully |
| Cash register, settlement, reconciliation | Shop Financials, Shop Transactions, Wallet & Refunds | Epic finance | Maker/checker and evidence stay visible |
| GST, journal, close, accounting statements | GSTR-1, Shop Financials | Epic accounting/statutory | Actual COGS only; no estimated margin |
| RBAC, SoD, audit, approvals | Team & Roles, Activity Log, Settings | Epic kernel | UI visibility never replaces IPC/domain permission |
| Devices, offline, recovery | Settings / Devices, Backup, Release | Epic desktop runtime | Surface status without claims of certification |
| Reports and intelligence | Analytics | Epic semantic metrics | Metric source and calculation state are explicit |

## P0 financial invariants

- Sales COGS is unambiguous: `unitCost` and `lineCostTotal` cannot be conflated.
- Category, SKU and store COGS roll-ups reconcile to the source sale COGS.
- Returns reverse original allocated COGS, with any rounding difference documented.
- Margin is `governed net revenue − governed COGS`; if cost is unavailable, the view says **Cost unavailable**.
- Unknown, unavailable, provider failure and permission denial never render as `₹0`, `0%` or “healthy”.
