# Retail rail certification — 30 August 2026

## Scope certified locally

The retail-first Electron renderer has a labelled, keyboard-addressable left
rail with eight primary workspaces and 32 stacked retail tasks. The following
focused test runs passed against the current transformation branch:

```powershell
pnpm exec vitest run src/renderer/RetailWorkspaceNavigation.test.tsx \
  src/renderer/RetailInsightsOverviewPanel.test.tsx \
  src/renderer/RetailReturnsOverviewPanel.test.tsx \
  src/renderer/RetailPricingOverviewPanel.test.tsx \
  src/renderer/RetailGstOverviewPanel.test.tsx \
  src/renderer/RetailDeliveryExceptionsPanel.test.tsx \
  --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=dot
# 6 files / 14 tests passed

pnpm exec vitest run src/renderer/App.test.tsx -t "routes every primary|keeps Home submodules|simple governed order queue|Products & variants|Stock control|Replenishment|Purchasing|Delivery order queue|Delivery control|RTO & returns|branch transfers|Cash register|Payments & settlements|GST & invoices|Finance close|Sales & margin|Stock & expiry|outlet comparison|Stores & users" --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=dot
# 19 passed / 45 intentionally skipped by this focused command
```

The certified routes open compact, source-backed retail workspaces where
implemented. Their protected workbenches still own monetary, inventory,
statutory, approval, and provider-facing writes.

The repository-wide TypeScript gate was also run after correcting two stale
test fixtures (`quarantined` → `quarantine`, and an impossible stock-ledger
type comparison):

```powershell
pnpm typecheck
# TYPECHECK_PASS
```

The complete locally achievable retail-core gate was rerun after the renderer
route contracts were reconciled with the current retail front doors:

```powershell
pnpm run verify:retail-core
# capability registry, IPC policy, renderer-copy, both TypeScript gates,
# main and Retail Hub test suites, and repository lint all passed locally.
```

The three repaired renderer assertions now prove the actual safety boundary:
the Returns rail item opens the read-first return queue, then explicitly hands
off to the governed returns workbench; it never co-mounts or intercepts POS.
The Home assertions likewise verify the current source-backed Dashboard,
Revenue trend, and Pending actions language instead of retired sample copy.

## Important limits

This is not yet a complete release certification. It does **not** prove:

- every advanced/admin form and role;
- production Electron packaging on Windows, macOS, and Linux;
- provider, portal, bank, marketplace, hardware, or Bakaloo Hub truth;
- live multi-store replication or outlet comparison;
- device, offline recovery, backup/restore, accessibility, and visual capture
  at every target viewport.

Those remain explicit release gates rather than inferred green status.
