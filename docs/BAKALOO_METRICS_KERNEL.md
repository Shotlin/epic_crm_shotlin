# Bakaloo Metrics Kernel

Phase 4 introduces a source-aware metrics boundary in `src/domain/bakaloo-metrics-kernel.ts`.

## Rules

1. Monetary values are stored and calculated in paise; display formatting is a separate UI concern.
2. A missing COGS, payment cost, delivery cost, household count, spend allocation or feedback source yields **unavailable**, never zero.
3. CM1, CM2, CM3 and CM4 use their real cost layers. No fallback percentage margin is permitted.
4. Each metric carries its source mode (`live`, `imported`, or `demo`) and collections required for evidence.
5. Demo data is deterministic and explicitly labelled as non-live. It is used only for isolated visual/calculation testing.

## Implemented metrics

| Metric | Formula / condition |
| --- | --- |
| Orders delivered | Delivered order count |
| Net revenue | Delivered gross − discount − refund |
| AOV | Net revenue ÷ delivered orders |
| Daily order density | Delivered orders/day ÷ (serviceable households ÷ 1,000) |
| Active customers / repeat rate | Unique delivered-order customers; customers with 2+ orders ÷ active customers |
| Cancellation rate | Cancelled orders ÷ all orders |
| SLA adherence | Delivered on/before promise ÷ delivered orders with both timestamps |
| CM1 | Net revenue − reconciled COGS |
| CM2 | CM1 − reconciled payment cost − variable delivery cost |
| CM3 | CM2 − allocated fixed store cost |
| CM4 | CM3 − marketing − technology/head-office cost |
| Break-even orders/day | Fixed cost/day ÷ positive CM3/order |
| CAC | Marketing spend ÷ first-time customers |
| NPS | Promoters (9–10) − detractors (0–6), as a percentage of valid responses |

## Workbook relationship

The attached 14-sheet framework is the source of product intent. This Phase 4 kernel establishes the shared order, customer, cost, delivery, household, marketing and feedback contracts required for the North Star, growth, unit economics, operations, finance and satisfaction measures. Phase 14 will add the remaining workbook measures, UI drillthrough, saved views and source-health reporting in the Bakaloo visual grammar.
