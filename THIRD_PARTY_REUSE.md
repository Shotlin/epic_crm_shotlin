# Third-Party Reuse Policy

This file records how Epic BOS may reuse the three reference repositories without accidentally changing the product's licensing model. It is an engineering policy, not legal advice; distribution terms should be reviewed by qualified counsel before commercial release.

## Audited repository baselines

| Repository | Audited commit | Root license | Epic BOS reuse approach |
|---|---:|---|---|
| `aureuserp/aureuserp` | `f7ac9c6` | MIT | Compatible implementation code may be adapted or ported with the required copyright and license notice. |
| `frappe/erpnext` | `576a5d2` | GPL-3.0 | Use as a functional and architectural reference. Direct code reuse requires a deliberate GPL-compatible distribution decision or a separately operated service boundary. |
| `odoo/odoo` | `2cb2f33` | LGPL-3.0, with some bundled files under other compatible licenses | Use as a domain reference or isolated service/library where LGPL obligations can be satisfied. Verify every reused file's header and bundled-license status. |

## Reuse rules

1. Preserve provenance: record source repository, commit, source path, destination path, modifications, copyright, and license for every direct import.
2. Do not copy GPL implementation into the MIT Electron application without an explicit product-level licensing decision.
3. Do not assume every Odoo file has identical terms; check the file header and any local license before reuse.
4. Prefer clean-room TypeScript implementations of business behavior when stack or license boundaries make direct reuse unsuitable.
5. Keep separately licensed engines behind documented APIs, adapters, or service boundaries, with independent source, notices, build artifacts, and upgrade paths.
6. Reuse tests, fixtures, text, icons, translations, and schemas only after checking their applicable license and attribution requirements.
7. Security-sensitive and accounting-critical behavior must be independently tested even when compatible code is reused.

## Product intent

The goal is full capability coverage and better execution—not line-for-line cloning. Epic BOS can reuse compatible work, integrate independently licensed engines, and implement additional capabilities while maintaining a coherent business kernel and a clear provenance trail.
