# Retail rail certification — 30 August 2026

## Scope certified locally

The retail-first Electron renderer has a labelled, keyboard-addressable left
rail with eight primary workspaces and 31 stacked retail tasks. The governed
UI acceptance catalog now contains 51 role-based journeys, including exact
Setup → Devices, Integrations, and Recovery & release readiness routes. The following
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

The Customer rail now has the same boundary for Campaigns and Data quality,
and Setup → Devices has a read-first readiness desk. These desks expose only
recorded local evidence; campaign sends, customer imports/merges, hardware
transport and driver activation remain deliberate governed handoffs.

Setup → Integrations and Setup → Recovery & release now also open compact,
read-first readiness desks. Integrations reports the current workspace mode,
Retail Hub status, and provider-evidence state without accepting secrets or
initiating external writes. Recovery reports database, audit, migration,
backup, restore-drill, and release evidence and hands off to the protected
control room for any mutation. This keeps the simple retail rail useful while
preserving the existing approval and recovery boundary.

## Important limits

This is not yet a complete release certification. It does **not** prove:

- every advanced/admin form and role;
- production Electron packaging on Windows, macOS, and Linux;
- provider, portal, bank, marketplace, hardware, or Bakaloo Hub truth;
- live multi-store replication or outlet comparison;
- device, offline recovery, backup/restore, accessibility, and visual capture
  at every target viewport.

Those remain explicit release gates rather than inferred green status.

The current `out/make` release matrix was checked against version `0.1.82`.
Windows x64 has three checksum-verified native artifacts; macOS and Linux have
no artifacts for this release line. The verifier correctly returns a **hold**
until native darwin and linux builds are produced and independently signed.

A fresh package from the current source was also launched with an isolated
profile and passed the packaged smoke marker `EPIC_BOS_SMOKE_OK` for Windows
version `0.1.82`. The generated evidence now binds that smoke result to the
actual Git source revision rather than leaving the build identity unknown.
This proves the executable starts and mounts its renderer; it does not
substitute for cross-platform signing, provider, hardware, or human UAT
certification.

The renderer-heavy boundary was then rerun in ten smaller bounded groups to
avoid a false timeout caused by one oversized jsdom worker:

```powershell
node scripts/run-test-batches.mjs --batch-size 8 --timeout-ms 180000 \
  --filter "src/renderer|src/main/(retail|revenue|runtime|statutory|support|ui|webhook|workspace)" \
  --output out/test-batches-2026-08-30-renderer-split
# 77 files, 10/10 batches passed
```

This is execution evidence for the same source revision and covers all
renderer suites plus the retail/main integration boundary. The earlier
32-file batch timed out only because it exceeded the single-worker budget;
the split run completed every one of those files without an assertion or
process failure.
