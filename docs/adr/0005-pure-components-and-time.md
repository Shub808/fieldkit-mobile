# ADR 0005 — Reading the clock is an external-store problem

**Status:** accepted · **Date:** 2026-10-27

## Context

This app is full of relative time: "2d ago", "in 14h", and the overdue flag
that depends on it. The obvious implementation is `Date.now()` inside the
component.

React's own lint rules reject that, and they are right twice over:

1. **It is impure.** Two reads during one render can disagree, so the same
   timestamp can render as "2h ago" in one place and "3h ago" in another.
2. **It is frozen.** The value is captured when the screen mounts, so a job
   that becomes overdue while the technician is looking at the list never
   says so.

## Decision

`useNow()` — a `useSyncExternalStore` over a module-level ticker that advances
every 30 seconds and notifies subscribers.

Every component takes `now` as a parameter. `timeLabel(iso, now)` and
`isOverdue(job, now)` are pure functions, so they are tested by passing a
fixed instant rather than by mocking the clock.

## Consequences

- Every relative label on a screen is computed from the same instant.
- Labels age live, and the overdue chip appears when the job actually becomes
  overdue.
- One interval for the whole app, which stops when the last subscriber
  unmounts.
- Components stay pure functions of their props, which is why they can be
  tested without a renderer-level time mock.
