# ADR 0003 — Ports and adapters, so the hard parts are testable without a device

**Status:** accepted · **Date:** 2026-10-27

## Context

The valuable logic in this app — the offline model, the merge, the retry
policy, the queue — is also the logic that is hardest to test if it is
entangled with React Native. A simulator is slow, a device is manual, and
neither can easily be put into the state "lost signal halfway through
draining a queue of four mutations, two of which the server had already
applied".

## Decision

Everything under `src/domain`, `src/sync`, `src/store` and `src/remote`
imports **nothing** from React, React Native or Expo. The two boundaries are
interfaces:

- **`LocalStore`** — five concepts (jobs, baseline, outbox, conflicts, meta).
  Adapters: `MemoryStore` and `AsyncStorageStore`.
- **`RemoteApi`** — `pull` and `push`. Implementation: `SimulatedRemote`.

The clock, the randomness and the id generator are constructor arguments on
`SyncEngine`, not module imports.

## Consequences

- 98 of the 122 tests run in plain Node in under two seconds, covering the
  merge, the backoff schedule, the queue, idempotency and every conflict path.
- **One contract suite runs against every store adapter.** The real
  serialising adapter is held to exactly the same assertions as the in-memory
  one, so "works in tests, breaks on device" cannot originate in the store.
- The simulated server is a *feature*, not a test double left in by accident:
  the Conditions screen drives its latency, failure rate and offline switch,
  so a reviewer can break it deliberately and watch the queue cope.
- The cost is indirection — a reader has to follow an interface to find the
  implementation. For the amount of behaviour behind these particular seams,
  that is a good trade.

## What this does not cover

Ports make the logic testable; they do not test the platform. The
AsyncStorage *native module*, real device storage limits, background
suspension and actual radio behaviour are not exercised here, and the README
says so rather than implying otherwise.
