# Bakaloo Visual Manifest

Status: Phase 2 baseline. Values are extracted from the pinned Bakaloo dashboard source and checked against the authenticated live dashboard where safe.

## Shared shell contract

| Surface | Reference contract |
| --- | --- |
| App background | `hsl(210 20% 98%)` / `#F0F4F8` surface language |
| Foreground | `hsl(220 14% 10%)` |
| Card | white, 1px `hsl(218 13% 90%)` border, low neutral shadow |
| Primary | `#1A7A3C`; primary gradient `#1A7A3C → #2E9E54` only for the lead KPI card |
| Semantic colors | success `#10B981`, warning `#F59E0B`, danger `#EF4444`, info `#3B82F6`, purple `#8B5CF6` |
| Light sidebar | white, 260px expanded / 72px collapsed |
| Header | sticky, 64px, white, shared global search/scope/status/actions |
| Radius | base 8px; cards and sheets use the matching 8–12px family |
| Shadow | neutral `--shadow-xs` through `--shadow-xl`; no blue-tinted global shadows |
| Font | Geist Sans where asset availability permits; tabular numerals for financial data |
| Icon system | Lucide, labelled for non-obvious actions, consistent stroke width |
| Scrolling | fixed shell with exactly one vertical workspace scroll owner; only data tables may scroll horizontally |

## Dark mode

Dark tokens are source-backed rather than inverted: `#0f1117` background, dark elevated cards, desaturated green primary `#2E9E54`, and individually tested semantic surface colors. Every chart and state needs a dark counterpart before parity can be marked complete.

## Dashboard visual contract

Reference viewports: 1366×768, 1440×900 and 1600×1000.

1. Header: `Dashboard`, subtitle `Overview of your store performance`, period controls: Today / This Week / This Month / This Year.
2. Live activity bar: connection state, active orders, riders online, today revenue and today orders.
3. Ten KPI cards in exact order: total revenue, total orders, products, customers, pending orders, low stock, online riders, today revenue, average order value, COD collections.
4. Abandoned-cart container: open carts, value at risk, recovered today and seven-day recovery rate.
5. Charts/widgets, in immutable order: Revenue Trend + Revenue by Category; Revenue vs Orders; Orders by Hour + Pending Actions; Top Products + Recent Orders; Low Stock + Live Rider Map.
6. A visual value is never a substitute for governed data: unavailable, loading, unconfigured and permission-denied are distinct states.

## Component inventory

| Component | Required reference behaviour |
| --- | --- |
| Sidebar | grouped sections, brand-green selected state, left active rule, collapsed labels via tooltip, nested Settings expansion, role filtered |
| Header | global search, active scope, shop selector where authorised, connection/reconnect state, theme toggle, notifications |
| Page header | title, concise subtitle, one primary action maximum, scoped action group |
| KPI | compact uppercase label, icon well, tabular value, delta, semantic state; primary revenue variant only |
| Card/table | calm border, low shadow, predictable padding, sticky/visible headings, no nested vertical scroll |
| Tabs/filters | accessible selected states, URL/route state where appropriate, keyboard operation |
| Drawer/dialog | focus trap, escape route, labelled submit/cancel, visible loading/error/retry state |
| Charts | Recharts geometry/palette, accessible summary, tooltip/legend, Indian INR/date formats |
| Empty/error/loading | explicit state and next action; never substitute zero for unknown |

## UI quality guardrails

- 4.5:1 normal-text contrast; visible focus; keyboard route for every action.
- 44px minimum touch/click target for primary controls.
- 150–300ms state motion and `prefers-reduced-motion` support.
- No emoji-based structural iconography; no generated image used as a functional control, map, chart or table.
- Heavy maps and large lists are lazy/virtualized so cashier input remains responsive.
