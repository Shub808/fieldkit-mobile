# ADR 0004 — One context, no state library

**Status:** accepted · **Date:** 2026-10-27

## Context

My day job uses Redux Toolkit, so reaching for a store was the default I had
to argue myself out of.

## Decision

A single `AppProvider` holding one coherent piece of state — the device's copy
of the work — with the sync engine behind it.

## Rationale

The usual reasons to add a store do not apply here:

- **Server-state caching?** The server is not the source of truth for the UI;
  the local store is. There is nothing to cache.
- **Derived/selector performance?** The dataset is one technician's day. The
  filtering on the work list is a `useMemo` over a few dozen items.
- **Cross-cutting state in many places?** There is one slice, read by three
  screens.
- **Middleware for async?** The engine already owns that, and it is a plain
  class that is tested directly.

What a store *would* add is a second place where state lives, which then has
to be kept consistent with what is actually on disk — and on disk is the only
copy that matters in this app.

## Consequences

- One re-render boundary. If the job list grew to thousands of rows, the
  context would need splitting or a store; that is a known future change, not
  a present cost.
- The provider takes optional `overrides` for its store and remote, so the
  real provider — not a reimplementation — is what the integration tests
  exercise.
- No library to upgrade, and the data flow is readable top to bottom.
