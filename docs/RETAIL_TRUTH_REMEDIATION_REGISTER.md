# Retail truth remediation register

**Owner:** Epic BOS product architecture  
**Scope:** Bakaloo retail Electron operator application  
**Rule:** A local UI must never manufacture an acknowledgement, settlement, provider status, gateway reference, receipt, bank proof, device proof, or delivery result and display it as an external fact.

## Operating rule

Every state-changing control is one of the following:

1. **Local governed fact** — the application itself performed and audited the local operation.
2. **Evidence capture** — an operator records a real, reviewable reference and a permitted independent reviewer decides the local status.
3. **Provider truth** — a signed webhook, a verified pull, or a provider response envelope changes the external status.
4. **Preparation only** — the application builds or exports a packet, but does not claim it was sent, accepted, paid, printed, or delivered.

Anything outside those categories is removed from the normal operator experience.

## Remediation batches

| Batch | Surface | Defect to remove | Required end state | Status |
|---|---|---|---|---|
| TR-01 | Core renderer demo panels and outbox | Fictional scenario/replay controls | Retail-only surfaces; read-only outbox evidence | Complete |
| TR-02 | POS vouchers and exchanges | Local voucher success and insufficient exchange evidence | Atomic checkout validation, immutable evidence, independent approval | Complete |
| TR-03 | Retail commerce ingestion | Pre-filled ONDC/marketplace orders, settlements, OCR and variance results | Hub/provider-envelope ingestion or clearly isolated preview only | Complete — local boundary |
| TR-04 | Provider, GSP and e-way surfaces | Locally generated `PACK`, `ACK`, gateway and consolidated-EWB references | Prepare/evidence/pull boundary; no fabricated external state | In progress — external certification remains |
| TR-05 | Treasury, payroll, returns, transfers and catalog/device actions | Canned bank, statutory, credit-note, custody and hardware evidence | Evidence-required local workflows with independent review | In progress — human/device evidence remains |
| TR-06 | Omnichannel lifecycle and advanced exceptions | Generated conflict, allocation, RTO and exception references | Provider-event-driven state plus reviewed local evidence | In progress — signed Hub receipt integration remains |
| TR-07 | Full UI certification | Route drift, hidden background workbenches and stale controls | Role-by-role, click-by-click packaged Electron evidence | In progress — two packaged journeys pass |
| TR-08 | Cutover and Electron provider boundary | Typed reconciliation plans and direct renderer-triggered provider operations | Fetch-only Hub assessment plus packaged-runtime fail-closed policy | Complete — local boundary |

## Evidence gate

No remediation batch is complete until its domain tests, renderer tests, typecheck, lint, and an appropriate packaged-app journey pass. A real provider/device claim additionally requires the provider/device evidence itself; it cannot be simulated locally.

## Latest local verification

On 2026-08-05 the current source passed TypeScript, ESLint, **234 test files / 982 tests**, and **2 packaged Windows Electron journeys**. The packaged POS journey completed a real INR 118 cash sale, verified receipt and SQLite stock movement, and verified the record again after a fresh application restart. This proves the local product boundary; it does not certify a bank, GSP/IRP, marketplace, carrier, device, or Bakaloo production provider.
