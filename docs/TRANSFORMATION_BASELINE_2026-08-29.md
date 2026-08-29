# Epic BOS × Bakaloo Transformation Baseline

## Phase 1 reference freeze

| Item | Frozen value |
| --- | --- |
| Epic repository | `Shotlin/epic_crm_shotlin` |
| Epic baseline commit | `748fa85dfd40c39b73b4e3045b1273818a99f13c` — *Complete retail operating system transformation* |
| Transformation branch | `transform/bakaloo-visual-parity` |
| Local rollback tag | `bakaloo-visual-parity-baseline-2026-08-29` → `748fa85dfd40c39b73b4e3045b1273818a99f13c` |
| Bakaloo dashboard reference | `shotlin085/bakaloo-dashboard` |
| Bakaloo pinned source commit | `d85bee598b5ed140f2bb126a81acb54904f2b961` |
| Live visual reference | Authenticated `dash.bakaloo.in` inspection, read-only, 29 August 2026 |
| Runtime | Electron Forge + React 19 + TypeScript 5 + Vite |
| Current release version | `0.1.82` |
| Baseline typecheck | Passed: `pnpm typecheck` |
| Baseline lint | Passed: `pnpm lint` |
| Full test baseline | Started 29 August 2026; result is not recorded until the test runner exits successfully. Historical retail-core evidence must not be treated as a current run. |

## Build and verification commands

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm run verify:retail-core
pnpm run make
pnpm run smoke:package
```

## Visual-source decision

1. The supplied executive transformation contract is the product decision.
2. Live Bakaloo controls layout, visual behaviour and presentation if it differs from the source repository.
3. Pinned Bakaloo source explains components, interactions and states.
4. Epic remains the authority for governed domains, financial correctness, local-first/offline behaviour, IPC security and audit evidence.

## Safety rules

- No Bakaloo production record, setting, user, order, payment, wallet or export is mutated during reference inspection.
- No live credential, customer information, token or provider secret is stored in this repository or transformation documentation.
- The existing blue Epic production shell is a deprecated visual source. Its domain actions remain retained until safely re-presented.
- The transformation must not be merged to `main` until the route manifest, visual evidence and verification gates are satisfied.

## Current blocking facts

- Native encrypted SQLite runtime, real hardware transports, provider credentials/certification, code signing/notarisation and real-store UAT remain external or release-certification gates.
- Those blockers do not prevent design-system, shell, local read-model, testing, documentation or offline-safety work.
