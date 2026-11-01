import type { ChecklistItem, Job, JobNote } from "@/domain/types";
import { mergeChecklist, mergeJob, mergeNotes, resolveConflict } from "@/sync/merge";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_001",
    reference: "FK-2400",
    title: "Annual boiler service",
    customerName: "Harbour Point Retail",
    siteAddress: "14 Quayside Parade, Bristol",
    scheduledFor: "2026-10-27T09:00:00.000Z",
    priority: "normal",
    status: "scheduled",
    assigneeId: "tech_morgan",
    checklist: [
      { id: "c1", label: "Isolate supply", required: true, done: false },
      { id: "c2", label: "Photograph", required: true, done: false },
      { id: "c3", label: "Tidy up", required: false, done: false },
    ],
    notes: [],
    completionNotes: "",
    updatedAt: "2026-10-27T07:00:00.000Z",
    rev: 4,
    ...overrides,
  };
}

const note = (id: string, createdAt: string): JobNote => ({
  id,
  body: `note ${id}`,
  authorName: "Morgan Hale",
  createdAt,
});

const tick = (items: ChecklistItem[], id: string, done = true): ChecklistItem[] =>
  items.map((item) => (item.id === id ? { ...item, done } : item));

describe("mergeJob — only one side moved", () => {
  it("takes the server's value when the device did not change the field", () => {
    const base = job();
    const mine = job();
    const theirs = job({ priority: "emergency", rev: 5 });

    const result = mergeJob(base, mine, theirs);
    expect(result.merged.priority).toBe("emergency");
    expect(result.conflicts).toHaveLength(0);
    expect(result.changedFromServer).toBe(true);
  });

  it("keeps the device's value when the server did not change the field", () => {
    const base = job();
    const mine = job({ status: "en_route" });
    const theirs = job({ rev: 5 });

    const result = mergeJob(base, mine, theirs);
    expect(result.merged.status).toBe("en_route");
    expect(result.conflicts).toHaveLength(0);
  });

  it("merges changes to different fields without a conflict — the case a two-way diff gets wrong", () => {
    const base = job();
    const mine = job({ status: "en_route" });
    const theirs = job({ priority: "high", rev: 5 });

    const result = mergeJob(base, mine, theirs);
    expect(result.merged.status).toBe("en_route");
    expect(result.merged.priority).toBe("high");
    expect(result.conflicts).toHaveLength(0);
  });

  it("is silent when both sides made the identical change", () => {
    const base = job();
    const mine = job({ status: "en_route" });
    const theirs = job({ status: "en_route", rev: 5 });

    const result = mergeJob(base, mine, theirs);
    expect(result.merged.status).toBe("en_route");
    expect(result.conflicts).toHaveLength(0);
  });
});

describe("mergeJob — both sides moved the same field", () => {
  it("records a conflict instead of picking a winner", () => {
    const base = job();
    const mine = job({ status: "en_route" });
    const theirs = job({ status: "cancelled", rev: 5 });

    const result = mergeJob(base, mine, theirs);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      field: "status",
      mine: "en_route",
      theirs: "cancelled",
      base: "scheduled",
    });
  });

  it("leaves the technician's value on screen while the conflict is open", () => {
    // Changing what someone is looking at, mid-job, is worse than waiting.
    const result = mergeJob(
      job(),
      job({ status: "en_route" }),
      job({ status: "cancelled", rev: 5 }),
    );
    expect(result.merged.status).toBe("en_route");
  });

  it("always takes office-owned fields from the server", () => {
    const result = mergeJob(
      job(),
      job({ title: "Local edit that should not exist" }),
      job({ title: "Rescheduled: annual boiler service", assigneeId: "tech_other", rev: 5 }),
    );
    expect(result.merged.title).toBe("Rescheduled: annual boiler service");
    expect(result.merged.assigneeId).toBe("tech_other");
    expect(result.merged.rev).toBe(5);
  });
});

describe("mergeNotes", () => {
  it("unions both sides, because notes are append-only", () => {
    const base = [note("n1", "2026-10-27T06:00:00.000Z")];
    const mine = [...base, note("n2", "2026-10-27T07:00:00.000Z")];
    const theirs = [...base, note("n3", "2026-10-27T06:30:00.000Z")];

    const merged = mergeNotes(base, mine, theirs);
    expect(merged.map((entry) => entry.id)).toEqual(["n1", "n3", "n2"]);
  });

  it("never duplicates a note that reached the server already", () => {
    const shared = note("n1", "2026-10-27T06:00:00.000Z");
    expect(mergeNotes([], [shared], [shared])).toHaveLength(1);
  });

  it("produces no conflicts for notes at all", () => {
    const result = mergeJob(
      job(),
      job({ notes: [note("mine", "2026-10-27T07:00:00.000Z")] }),
      job({ notes: [note("theirs", "2026-10-27T07:30:00.000Z")], rev: 5 }),
    );
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.notes.map((entry) => entry.id)).toEqual(["mine", "theirs"]);
  });
});

describe("mergeChecklist", () => {
  const base = job().checklist;

  it("merges ticks on different items cleanly", () => {
    const items = mergeChecklist(base, tick(base, "c1"), tick(base, "c3"));
    expect(items.find((item) => item.id === "c1")?.done).toBe(true);
    expect(items.find((item) => item.id === "c3")?.done).toBe(true);
  });

  it("keeps the device's tick when the server has not seen it", () => {
    const items = mergeChecklist(base, tick(base, "c1"), base);
    expect(items.find((item) => item.id === "c1")?.done).toBe(true);
  });

  it("takes the server's tick when the device has not moved the item", () => {
    const items = mergeChecklist(base, base, tick(base, "c2"));
    expect(items.find((item) => item.id === "c2")?.done).toBe(true);
  });

  it("honours an untick the device made", () => {
    const started = tick(base, "c1", true);
    const items = mergeChecklist(started, tick(started, "c1", false), started);
    expect(items.find((item) => item.id === "c1")?.done).toBe(false);
  });

  it("adopts checklist items the office has added", () => {
    const theirs: ChecklistItem[] = [
      ...base,
      { id: "c4", label: "New requirement", required: true, done: false },
    ];
    const items = mergeChecklist(base, base, theirs);
    expect(items).toHaveLength(4);
    expect(items.at(-1)?.id).toBe("c4");
  });

  it("drops an item the office has removed", () => {
    const theirs = base.filter((item) => item.id !== "c3");
    expect(mergeChecklist(base, tick(base, "c3"), theirs).map((i) => i.id)).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("cannot produce a conflict, because `done` is a boolean", () => {
    // If both sides moved away from the same base, a two-valued field means
    // they both moved to !base — which is the same value. "Both moved,
    // differently" is unreachable here, which is why mergeChecklist has no
    // conflict branch. This test exists to pin that reasoning down.
    for (const baseDone of [false, true]) {
      const start = tick(base, "c1", baseDone);
      const mine = tick(start, "c1", !baseDone);
      const theirs = tick(start, "c1", !baseDone);
      const merged = mergeChecklist(start, mine, theirs);
      expect(merged.find((item) => item.id === "c1")?.done).toBe(!baseDone);
    }

    const result = mergeJob(
      job(),
      job({ checklist: tick(base, "c1", true) }),
      job({ checklist: tick(base, "c1", true), rev: 5 }),
    );
    expect(result.conflicts).toHaveLength(0);
  });
});

describe("resolveConflict", () => {
  it("applies the device's value", () => {
    const current = job({ status: "cancelled" });
    const resolved = resolveConflict(current, {
      id: "cf1",
      jobId: current.id,
      field: "status",
      mine: "en_route",
      theirs: "cancelled",
      base: "scheduled",
      detectedAt: "2026-10-27T08:00:00.000Z",
    }, "keep_mine");
    expect(resolved.status).toBe("en_route");
  });

  it("applies the server's value", () => {
    const current = job({ status: "en_route" });
    const resolved = resolveConflict(current, {
      id: "cf1",
      jobId: current.id,
      field: "status",
      mine: "en_route",
      theirs: "cancelled",
      base: "scheduled",
      detectedAt: "2026-10-27T08:00:00.000Z",
    }, "keep_theirs");
    expect(resolved.status).toBe("cancelled");
  });

  it("applies a completion-notes decision", () => {
    const current = job({ completionNotes: "Server write-up." });
    const resolved = resolveConflict(
      current,
      {
        id: "cf3",
        jobId: current.id,
        field: "completionNotes",
        mine: "Replaced the pump seal and pressure-tested the system.",
        theirs: "Server write-up.",
        base: "",
        detectedAt: "2026-10-27T08:00:00.000Z",
      },
      "keep_mine",
    );
    expect(resolved.completionNotes).toBe(
      "Replaced the pump seal and pressure-tested the system.",
    );
  });

  it("does not mutate the job it was given", () => {
    const current = job({ status: "en_route" });
    resolveConflict(current, {
      id: "cf1", jobId: current.id, field: "status",
      mine: "en_route", theirs: "cancelled", base: "scheduled",
      detectedAt: "2026-10-27T08:00:00.000Z",
    }, "keep_theirs");
    expect(current.status).toBe("en_route");
  });
});
