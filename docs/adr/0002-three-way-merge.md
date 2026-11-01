# ADR 0002 — Three-way merge, and conflicts that a human resolves

**Status:** accepted · **Date:** 2026-10-27

## Context

Once the device can write offline, two copies of a job can move apart. The
office reschedules it; the technician marks it en route. Both are correct.

The device holds `mine`. The server sends `theirs`. Comparing just those two
shows that they differ — but not *which side moved*. Choosing a winner on that
basis is how offline apps quietly discard work.

## Decision

The device stores a third copy: **`baseline`**, the last version the server
confirmed. With that in hand, every field has exactly four cases:

| | Result |
|---|---|
| `mine === base` | the server moved — take theirs |
| `theirs === base` | the device moved — keep mine |
| `mine === theirs` | both moved the same way — nothing to do |
| otherwise | a genuine conflict — a human decides |

Fields the office owns (title, address, schedule, assignee) always come from
the server; the device never edits them.

Two field types do better than the default because their structure allows it:

- **Notes are append-only.** Both sides' notes are unioned by id, so a note
  added offline and a note added by the office both survive. Notes cannot
  conflict, by construction.
- **Checklist items merge per item.** A technician ticking item 3 while the
  office ticks item 7 merges cleanly instead of conflicting.

### A checklist item cannot conflict

This is worth recording, because the code looks like it is missing a case.
`done` is a boolean. If both sides moved away from the base they must both
have moved to `!base` — the same value. "Both moved, differently" is
unreachable for a two-valued field.

An earlier version of `mergeChecklist` carried a conflict branch for it. It
was dead code, and the test that was supposed to exercise it could not be
written. The branch was removed, and
`__tests__/unit/merge.test.ts` now contains a test that pins the reasoning
down instead.

## What the user sees

A genuine conflict is **not** resolved automatically. It is held, and the Sync
screen shows all three values:

> **Priority — Annual boiler service**
> It was *High* when you last synced.
> **You set** Low · **Office set** Emergency
> [Keep mine] [Use theirs]

"Keep mine" re-queues the device's value against the server's current
revision, so the technician's decision actually reaches the office.

## Consequences

- Nobody's edit disappears silently.
- The common case — two people touching different fields of the same job —
  merges with no interruption at all. Only real disagreements reach the user.
- A conflict is extra UI, extra state and a decision the user has to make.
  That is the right trade here: the alternative is being wrong invisibly.
- The baseline is a third copy of every job on the device. For this data
  volume that is nothing; for a much larger dataset it would be worth storing
  a hash or a field-level dirty set instead.
