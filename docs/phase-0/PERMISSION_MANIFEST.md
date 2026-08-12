# Bakaloo Retail Business OS — Canonical Permission Manifest

## Security rule

Default deny is mandatory. A renderer route, dashboard route, IPC channel, API endpoint, job, export, report, provider callback and device action must have one explicit authorization posture:

1. **Trusted bootstrap** — only minimal local app/version/auth bootstrap routes, with trusted-sender validation.
2. **Permission-bound** — explicit resource, action and tenant/company/outlet record scope.
3. **Delegated-record-bound** — the handler resolves a validated record then applies an explicit named record-scope authorizer.
4. **Denied** — unavailable until a permission posture is implemented.

“Authenticated session” alone is not an acceptable posture for a business action.

## Canonical resource/action format

~~~text
resource: domain.subdomain
action: read | create | update | submit | approve | post | reverse | export | admin
scope: tenant | company | outlet | record | own-assignment
~~~

Examples:

| Operation | Required permission |
| --- | --- |
| Cashier completes permitted POS sale | sales.commercial:create at outlet |
| Manager approves cash variance | finance.cash:approve at outlet, with SoD check |
| Inventory lead receives GRN | inventory.execution:update at outlet |
| Finance posts journal | finance.journal:post at company/outlet and period scope |
| CRM lead creates segment | crm.configuration:create at tenant/company |
| Administrator configures provider | integration.provider:update at tenant with step-up |
| Release owner records certification evidence | release.control:admin at tenant with evidence reason |

## Segregation-of-duties minimums

- A maker cannot approve their own high-risk refund, write-off, price override, cash variance, transfer discrepancy, provider credential, role/policy or production cutover unless a named exception policy grants it.
- A cashier cannot alter product masters, provider credentials, ledger entries, release evidence or role grants.
- A shop/outlet staff account cannot inherit enterprise/HQ data access from a legacy base role.
- Provider callbacks are not human actions; they receive a constrained machine identity and signature validation before any state transition.

## Phase 0 IPC remediation

Epic BOS has 538 declared IPC channels. This delivery gives all 538 an explicit posture: 315 direct policy entries and 223 named delegated handlers. The Phase 0 implementation must:

1. Keep the removed session baseline from returning.
2. Promote each generic delegated handler to an exact resource/action/scope or named record resolver.
3. Require a reason and named record resolver for every delegated route.
4. Add a test that rejects an unspecified channel and that enumerates all declared channels.
5. Maintain the generated capability registry with the policy status, resource, action and scope.

This migration is performed in bounded domains (kernel/release, retail core, inventory/purchase, finance, customer/CRM, delivery, people, legacy advanced workbenches). A domain is not enabled for a role until its channels are complete.

## Sensitive-operation policy

The following require re-authentication or step-up policy before the Hub exposes them: credential changes, role/grant changes, payment/refund/settlement release, price override, bulk import/export of PII, backup restore, production cutover, release signing/updates and account recovery.
