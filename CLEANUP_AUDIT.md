# Workspace cleanup audit

## Canonical product

`outputs/epic-bos` is the only canonical Epic BOS product. It is an Electron Forge, Vite, React and TypeScript desktop application.

## Retained reference projects

- `work/aureuserp` is the upstream Laravel/Vite reference repository. It is not an Epic BOS application and was not merged because it contains no unique Indian-retail desktop workflow absent from Epic BOS.
- `work/erpnext` and `work/odoo` remain reference repositories.
- `work/epic-bos-template` is an Electron starter template. It contains only starter main, preload, renderer and CSS files, so there is no product functionality to import.

These references are retained because they are source material, not generated application output.

## Generated build cleanup

The following superseded Electron Forge package directories are generated output, not source. They are safe to remove because the current package can be reproduced with `pnpm build` and the dedicated Windows release output is retained separately.

- `out-general-ledger-hardening`
- `out-stabilisation-auth-nav`
- `out-workspace-refresh`

Retained build output:

- `out` — current package output
- `out-release-windows` — retained Windows release artifact

## Not found

No separate `desktop/server/webapp` Fastify project exists in this workspace. If one exists elsewhere on the machine, it must be audited before deletion; it is not safe to infer its path or remove it from this workspace cleanup.
