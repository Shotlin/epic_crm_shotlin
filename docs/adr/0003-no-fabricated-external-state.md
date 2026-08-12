# ADR 0003 — Provider and operational truth

**Status:** Accepted  
**Date:** 2026-08-06

## Decision

The system distinguishes local fact, operator evidence, provider truth and preparation-only state. It does not create fictional payment, GST, map, delivery, print, settlement, provider or certification results.

## Consequences

- Unconfigured providers fail closed with a useful next action.
- Maps show no fallback location without verified permitted fresh data.
- Credential rotations invalidate related certification/approval evidence.
- Tests use fixtures only within clearly labelled test boundaries and cannot upgrade a provider/device state to READY.
