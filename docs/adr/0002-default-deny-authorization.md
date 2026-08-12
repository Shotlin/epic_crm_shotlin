# ADR 0002 — Default-deny authorization

**Status:** Accepted  
**Date:** 2026-08-06

## Decision

Every API, Electron IPC channel, job, export, report, device action and provider callback receives an explicit authorization posture: trusted bootstrap, permission-bound, delegated-record-bound or denied. A session-only fallback is transitional technical debt and will be removed in Phase 0.

## Consequences

- Each channel is listed in the capability registry with permission/resource/action/scope status.
- Delegated routes must declare their record resolver and reason.
- UI permission rendering is convenience only; server/main-process authorization is authoritative.
- Legacy ADMIN cannot confer HQ/outlet access without canonical scoped grants.
