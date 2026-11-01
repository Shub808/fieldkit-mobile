# ADR 0001 — Local-first writes with an outbox queue

**Status:** accepted · **Date:** 2026-10-27

## Context

A field technician's day runs through plant rooms, lift shafts, basements and
rural sites. Signal is not "mostly there with occasional drops" — it is absent
for hours and then back for ninety seconds in a car park.

The naive design is to call the API and show a spinner. Every one of its
failure modes is unacceptable here:

- A tap that does nothing because there is no signal.
- Work that is lost when the app is killed in the background.
- A technician who finishes a job and discovers at 18:00 that none of it
  reached the office.

## Decision

Every write is **local-first**:

1. The mutation is applied to the device's own copy of the job, immediately
   and synchronously from the UI's point of view. The screen updates; nothing
   waits on a network.
2. The mutation is appended to a durable **outbox** — an ordered, persisted
   queue of changes that have not yet been accepted by the server.
3. A **sync engine** drains that queue when it can, and merges what the server
   sends back.

The device's copy is the one the UI reads from, always. The network is a
background concern that the user observes through the Sync screen, not
something they wait on.

## Consequences

**Good**

- The app behaves identically with and without signal. Nothing is disabled,
  nothing spins.
- Work survives the app being killed, the battery dying, or the device
  rebooting — the queue is on disk.
- Business rules are enforced on the device, so a technician learns that a
  required checklist item is outstanding *while they are still on site*.
- The engine is a plain class over injected ports, so every failure path —
  signal lost mid-drain, a flapping server, a lost response, a concurrent
  edit — is an ordinary deterministic unit test. There are 98 of them, and
  none needs a simulator.

**Costs**

- Two copies of the truth, and therefore a merge problem. That is ADR 0002.
- The queue is a real data structure with real states (pending, retrying,
  dead-lettered), and the user has to be able to see it. That is what the
  Sync screen is for.
- A mutation that the server will never accept has to be detected and
  surfaced rather than retried forever.
- `baseRev` has to be threaded through every mutation, and re-pointed when an
  earlier mutation for the same job lands. Getting that wrong makes a device's
  own queued changes conflict with each other.

## Rejected

- **Read-only offline.** Showing cached jobs but refusing writes without
  signal is barely better than nothing: the writes are the whole job.
- **Last-write-wins on a timestamp.** Clock skew between a phone and a server
  silently discards work, and there is no way for the user to know it
  happened.
- **A sync library.** The interesting part of this project *is* the sync
  behaviour; delegating it would leave a wrapper around someone else's
  decisions, and the failure modes would still be mine to explain.
