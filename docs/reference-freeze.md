# Bakaloo Transformation Reference Freeze

**Frozen on:** 2026-09-07 (Asia/Kolkata)  
**Contract:** `EPIC_BOS_BAKALOO_IDENTICAL_MASTER_CODEX_PROMPT_V4.md`

## Pinned sources

| Source | Remote | Ref | SHA | Status |
| --- | --- | --- | --- | --- |
| Epic BOS implementation | `Shotlin/epic_crm_shotlin` | `main` | `5c582ed23b322504fb9532fd474fa681ce2ce669` | Clean local checkout on `transform/bakaloo-visual-parity` |
| Bakaloo dashboard reference | `shotlin085/bakaloo-dashboard` | `main` | `8b5de53b198759644cb3edaf42dcbc9b880177c6` | Clean, separate reference checkout at `audit/bakaloo-dashboard-8b5de53` |

The Epic remote's historical `master` HEAD remains at
`7f501631795aba1e5595a4e3ed02ce66e3864226`; transformation work targets
the current `main` branch and must not assume the historical default ref is
the release source.

## Metrics reference

| Item | Value |
| --- | --- |
| Workbook | `management system_Metrics_Dashboard_Framework.xlsx` |
| SHA-256 | `BB3F031E4B4FBAE6E376CEA004A845CBC36538714DD2AB3FC172CBD2D06C4368` |
| Sheets | 14: Overview & North Star; Growth & Acquisition; Retention & Engagement; Sales & Transactions; Unit Economics; COGS & Wastage; Operations & Fulfillment; Rider & Fleet; Customer Satisfaction; Finance; Marketing; Data Schema; Cohorts; Correlations & Tooling |

The workbook is the authoritative metric inventory. Its benchmark figures are
directional context, never implicit production targets.

## Environment

| Tool | Version |
| --- | --- |
| OS | Windows 10.0.26200.0 |
| Git | 2.53.0.windows.2 |
| Node | v24.13.0 |
| pnpm | 11.20.0 |
| Epic package | 0.1.84 |
| Vitest | 3.2.7 |

## Baseline verification

Executed from the pinned Epic checkout on 2026-09-07:

```text
pnpm verify
  typecheck: passed
  test: 259 files passed, 1,139 tests passed
  lint: passed
```

## Visual evidence available

The supplied screen recording was reviewed read-only. It captures the live
Bakaloo dashboard shell and the following routes/states:

- Dashboard with `This Week` selected, live-activity bar, the ten KPI cards,
  abandoned-carts section, white sidebar and 64px header.
- Settings / Fees and Settings / Tip Presets, including nested navigation,
  table skeleton loading and form/control density.
- Abandoned Carts with its summary cards, filters and operational table.
- Analytics with period controls, PDF/Excel actions and the dashboard chart
  frame.

Reference source remains the complete visual/behavior specification. The
current session has no separately authenticated live-browser evidence beyond
the user-supplied read-only recording, so live-only behavior must not be
invented.

## Safety and rollback baseline

- The existing older Bakaloo checkout was already dirty and was not modified.
- A separate clean checkout is used for all source comparison.
- Credential-pattern scanning found only tracked implementation/test/auth
  references for later Phase 5 review; no credential values are recorded in
  this document.
- The Epic repository has encrypted database, backup, restore and key-rotation
  entry points. Their behavior remains subject to the later security and
  recovery phases.
- The Git checkpoint created after this document is the rollback point for the
  V4 transformation program.

## Open evidence limitations

1. Real provider, device, statutory and banking certification requires
   external credentials and independently captured evidence.
2. Live Bakaloo behavior not represented in the pinned repository or supplied
   recording will be marked as an external evidence limitation rather than
   fabricated.
3. Production data is not imported or modified by this baseline work.
