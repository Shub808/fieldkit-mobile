import { MUTABLE_FIELDS, type ChecklistItem, type Conflict, type Job, type JobNote, type MutableField } from "@/domain/types";

/**
 * Three-way merge.
 *
 * The device holds three copies of a job: `base` (what the server last
 * confirmed), `mine` (base plus whatever the technician has done since), and
 * `theirs` (what the server holds now). Comparing only `mine` and `theirs`
 * tells you they differ but not *which side moved*, and picking a winner on
 * that basis is how offline apps silently discard someone's work.
 *
 * Per field, with `base` in hand, there are exactly four cases:
 *
 *   mine === base              → the server moved; take theirs
 *   theirs === base            → I moved; keep mine
 *   mine === theirs            → both moved the same way; nothing to do
 *   otherwise                  → a genuine conflict; a human decides
 *
 * Two field types get better treatment than that default, because their
 * structure allows it:
 *
 *   notes     — append-only, so both sides' notes are unioned by id and a
 *               conflict is impossible by construction.
 *   checklist — merged per item, so one technician ticking item 3 while the
 *               office ticks item 7 merges cleanly instead of conflicting.
 */

export interface MergeOutcome {
  merged: Job;
  conflicts: Omit<Conflict, "id" | "detectedAt">[];
  /** True when anything at all was taken from the server copy. */
  changedFromServer: boolean;
}

const eq = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Union of two append-only note lists, ordered by creation time. */
export function mergeNotes(
  base: JobNote[],
  mine: JobNote[],
  theirs: JobNote[],
): JobNote[] {
  const byId = new Map<string, JobNote>();
  for (const note of [...base, ...theirs, ...mine]) byId.set(note.id, note);
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Item-level three-way merge of a checklist.
 *
 * The item list itself is office-owned — the server decides what the work is —
 * so only the `done` flag is something the device changes.
 *
 * **A checklist item cannot conflict**, and that is worth stating because the
 * code would otherwise look like it is missing a case. `done` is a boolean, so
 * if both sides moved away from the base they must both have moved to the same
 * value: `!base`. "Both moved, differently" is unreachable for a two-valued
 * field. An earlier version of this function carried a conflict branch for it;
 * it was dead code, and the test that was supposed to exercise it could not be
 * written. See docs/adr/0002-three-way-merge.md.
 */
export function mergeChecklist(
  base: ChecklistItem[],
  mine: ChecklistItem[],
  theirs: ChecklistItem[],
): ChecklistItem[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const mineById = new Map(mine.map((item) => [item.id, item]));

  return theirs.map((theirItem) => {
    const baseItem = baseById.get(theirItem.id);
    const myItem = mineById.get(theirItem.id);

    // An item the device has never seen simply arrives from the server.
    if (!myItem || !baseItem) return { ...theirItem };

    const iMoved = myItem.done !== baseItem.done;
    return { ...theirItem, done: iMoved ? myItem.done : theirItem.done };
  });
}

export function mergeJob(base: Job, mine: Job, theirs: Job): MergeOutcome {
  const conflicts: MergeOutcome["conflicts"] = [];
  // Start from the server copy: fields the device does not own (title,
  // address, schedule, assignee) always come from the office.
  const merged: Job = { ...theirs };
  let changedFromServer = false;

  for (const field of MUTABLE_FIELDS) {
    if (field === "notes") {
      merged.notes = mergeNotes(base.notes, mine.notes, theirs.notes);
      if (!eq(merged.notes, mine.notes)) changedFromServer = true;
      continue;
    }

    if (field === "checklist") {
      merged.checklist = mergeChecklist(base.checklist, mine.checklist, theirs.checklist);
      if (!eq(merged.checklist, mine.checklist)) changedFromServer = true;
      continue;
    }

    const baseValue = base[field];
    const myValue = mine[field];
    const theirValue = theirs[field];

    if (eq(myValue, theirValue)) continue;

    if (eq(myValue, baseValue)) {
      // Only the server moved.
      changedFromServer = true;
      continue;
    }

    if (eq(theirValue, baseValue)) {
      // Only this device moved.
      assignField(merged, field, myValue);
      continue;
    }

    // Both moved, differently.
    conflicts.push({
      jobId: theirs.id,
      field,
      mine: myValue,
      theirs: theirValue,
      base: baseValue,
    });
    // The device's value stays on screen until a human resolves it.
    assignField(merged, field, myValue);
  }

  merged.updatedAt =
    mine.updatedAt > theirs.updatedAt ? mine.updatedAt : theirs.updatedAt;

  return { merged, conflicts, changedFromServer };
}

function assignField(job: Job, field: MutableField, value: unknown): void {
  switch (field) {
    case "status":
      job.status = value as Job["status"];
      return;
    case "priority":
      job.priority = value as Job["priority"];
      return;
    case "completionNotes":
      job.completionNotes = value as string;
      return;
    case "checklist":
      job.checklist = value as ChecklistItem[];
      return;
    case "notes":
      job.notes = value as JobNote[];
      return;
  }
}

/**
 * Applies a human's decision about one conflicted field.
 *
 * Only the scalar fields reach here: notes merge by union and checklist items
 * cannot conflict (see `mergeChecklist`), so those two are never the subject
 * of a conflict record.
 */
export function resolveConflict(
  job: Job,
  conflict: Conflict,
  resolution: "keep_mine" | "keep_theirs",
): Job {
  const next: Job = structuredClone(job);
  assignField(
    next,
    conflict.field,
    resolution === "keep_mine" ? conflict.mine : conflict.theirs,
  );
  return next;
}
