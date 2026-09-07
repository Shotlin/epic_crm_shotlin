# Bakaloo V4 UI Parity Manifest

Generated from the pinned Bakaloo source checkout by `scripts/generate-bakaloo-route-contracts.mjs`. It is an evidence register, not a claim that a route is already complete.

## Audit status

- **Routes discovered from source:** 79
- **Live video evidence:** only the four noted surfaces were observed in the user-supplied recording. All other routes are source-inspected only.
- **Epic implementation status:** every route starts as **not certified** under V4 until its data, states, scope, visual comparison and focused interaction test are recorded.
- **Per-route visual contracts:** `docs/bakaloo-visual-contracts/`

## Shared shell contract

- 260 px expanded / 72 px collapsed left sidebar; 64 px sticky header; one vertical workspace scroll owner.
- White app surfaces, calm neutral borders/shadows, Bakaloo-green selected navigation, Lucide iconography and accessible labelled actions.
- Any unknown, unauthorized, unconfigured or failed value must be visible as that state—never fabricated and never silently rendered as zero.

| Bakaloo route | Pinned source | Live recording | Epic destination | Scope | V4 certification status |
| --- | --- | --- | --- | --- | --- |
| `/abandoned-carts` | `src/app/(dashboard)/abandoned-carts/page.tsx` | Yes — abandoned carts (00:44) | Customers / cart recovery | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/activity-log` | `src/app/(dashboard)/activity-log/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/analytics` | `src/app/(dashboard)/analytics/page.tsx` | Yes — analytics (01:04) | Insights / retail analytics | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/area-segments` | `src/app/(dashboard)/area-segments/page.tsx` | No | Deliver / dispatch controls | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/banners` | `src/app/(dashboard)/banners/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/cart-milestones` | `src/app/(dashboard)/cart-milestones/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/categories` | `src/app/(dashboard)/categories/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/coupons` | `src/app/(dashboard)/coupons/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/customer-activity` | `src/app/(dashboard)/customer-activity/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/customer-segments` | `src/app/(dashboard)/customer-segments/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/customers` | `src/app/(dashboard)/customers/page.tsx` | No | Customers / customer 360 | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` | Yes — dashboard (00:04) | Home / retail command centre | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/first-time-offers` | `src/app/(dashboard)/first-time-offers/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/audit-logs` | `src/app/(dashboard)/hq/audit-logs/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/coverage-map` | `src/app/(dashboard)/hq/coverage-map/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/dashboard` | `src/app/(dashboard)/hq/dashboard/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/finance` | `src/app/(dashboard)/hq/finance/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/finance/gstr1` | `src/app/(dashboard)/hq/finance/gstr1/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/orders` | `src/app/(dashboard)/hq/orders/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/products` | `src/app/(dashboard)/hq/products/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/reports` | `src/app/(dashboard)/hq/reports/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/riders` | `src/app/(dashboard)/hq/riders/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/hq/shops` | `src/app/(dashboard)/hq/shops/page.tsx` | No | HQ control plane | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/me` | `src/app/(dashboard)/me/page.tsx` | No | Setup / personal profile | User | Not started — legacy/partial Epic surface is not V4 parity |
| `/notifications` | `src/app/(dashboard)/notifications/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/orders` | `src/app/(dashboard)/orders/page.tsx` | No | Sell / unified orders | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/orders/new` | `src/app/(dashboard)/orders/new/page.tsx` | No | Sell / unified orders | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/products` | `src/app/(dashboard)/products/page.tsx` | No | Stock / catalogue | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/products/:id/edit` | `src/app/(dashboard)/products/[id]/edit/page.tsx` | No | Stock / catalogue | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/products/families` | `src/app/(dashboard)/products/families/page.tsx` | No | Stock / catalogue | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/products/families/:id` | `src/app/(dashboard)/products/families/[id]/page.tsx` | No | Stock / catalogue | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/products/new` | `src/app/(dashboard)/products/new/page.tsx` | No | Stock / catalogue | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/purchase-limits` | `src/app/(dashboard)/purchase-limits/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/refund-requests` | `src/app/(dashboard)/refund-requests/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/reviews` | `src/app/(dashboard)/reviews/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/riders` | `src/app/(dashboard)/riders/page.tsx` | No | Deliver / dispatch controls | HQ + store | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings` | `src/app/(dashboard)/settings/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/app-branding` | `src/app/(dashboard)/settings/app-branding/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/app-version` | `src/app/(dashboard)/settings/app-version/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/delivery-calendar` | `src/app/(dashboard)/settings/delivery-calendar/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/delivery-timer` | `src/app/(dashboard)/settings/delivery-timer/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/fees` | `src/app/(dashboard)/settings/fees/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/legal-pages` | `src/app/(dashboard)/settings/legal-pages/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/maps` | `src/app/(dashboard)/settings/maps/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/order-notifications` | `src/app/(dashboard)/settings/order-notifications/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/payment-offers` | `src/app/(dashboard)/settings/payment-offers/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/payments` | `src/app/(dashboard)/settings/payments/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/pincode-mapping` | `src/app/(dashboard)/settings/pincode-mapping/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/product-suggestions` | `src/app/(dashboard)/settings/product-suggestions/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/store-hours` | `src/app/(dashboard)/settings/store-hours/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/tip-presets` | `src/app/(dashboard)/settings/tip-presets/page.tsx` | Yes — tip presets (00:24) | Setup / checkout policy | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/settings/wallet` | `src/app/(dashboard)/settings/wallet/page.tsx` | No | Setup / controlled configuration | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/shop-financials` | `src/app/(dashboard)/shop-financials/page.tsx` | No | HQ / shop reporting | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/shop-products` | `src/app/(dashboard)/shop-products/page.tsx` | No | HQ / shop reporting | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/shop-transactions` | `src/app/(dashboard)/shop-transactions/page.tsx` | No | HQ / shop reporting | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/shops` | `src/app/(dashboard)/shops/page.tsx` | No | Setup / shops and branches | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/shops/:shopId` | `src/app/(dashboard)/shops/[shopId]/page.tsx` | No | Setup / shops and branches | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/shops/:shopId/edit` | `src/app/(dashboard)/shops/[shopId]/edit/page.tsx` | No | Setup / shops and branches | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/shops/:shopId/staff` | `src/app/(dashboard)/shops/[shopId]/staff/page.tsx` | No | Setup / shops and branches | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/shops/new` | `src/app/(dashboard)/shops/new/page.tsx` | No | Setup / shops and branches | HQ | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/audit-logs` | `src/app/(dashboard)/store/audit-logs/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/coupons` | `src/app/(dashboard)/store/coupons/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/dashboard` | `src/app/(dashboard)/store/dashboard/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/financials` | `src/app/(dashboard)/store/financials/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/inventory` | `src/app/(dashboard)/store/inventory/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/inventory/movements` | `src/app/(dashboard)/store/inventory/movements/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/orders` | `src/app/(dashboard)/store/orders/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/products` | `src/app/(dashboard)/store/products/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/reports` | `src/app/(dashboard)/store/reports/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/staff` | `src/app/(dashboard)/store/staff/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/store/transactions` | `src/app/(dashboard)/store/transactions/page.tsx` | No | Store operations | Store | Not started — legacy/partial Epic surface is not V4 parity |
| `/team` | `src/app/(dashboard)/team/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/theme-tabs` | `src/app/(dashboard)/theme-tabs/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/themes` | `src/app/(dashboard)/themes/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/themes/:id` | `src/app/(dashboard)/themes/[id]/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/themes/builder` | `src/app/(dashboard)/themes/builder/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/themes/new` | `src/app/(dashboard)/themes/new/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/tutorials` | `src/app/(dashboard)/tutorials/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |
| `/wallet` | `src/app/(dashboard)/wallet/page.tsx` | No | Mapped in Phase 3 capability audit | Role controlled | Not started — legacy/partial Epic surface is not V4 parity |

## Required completion evidence

A route may move to certified only after its exact visual hierarchy, governed data binding, loading/empty/error/permission states, HQ/store scope, keyboard/accessibility path, three target viewport comparison and focused interaction/E2E evidence are recorded.
