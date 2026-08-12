# ADR 0001 — Store Edge and Retail Hub ownership

**Status:** Accepted  
**Date:** 2026-08-06

## Context

Bakaloo already has a live backend/dashboard and Epic BOS has local Electron workflows. Copying either into the other would create competing databases and unsafe writes.

## Decision

Epic BOS Electron is the Store Edge. It owns local POS, physical-store execution, cash/shift/device evidence and durable offline command capture. Retail Hub becomes the cloud coordination and canonical cloud-fact service. Bakaloo Dashboard remains a client, not a durable owner. Bakaloo Backend remains the read-only migration source until each capability cuts over.

## Consequences

- No direct renderer-to-Bakaloo production API connection.
- No big-bang replacement or data deletion.
- Cross-runtime facts require a versioned command/event, idempotency, audit, reconciliation and rollback boundary.
- Existing read-only Hub contracts are retained and expanded into a deployed service in Phase 2.
