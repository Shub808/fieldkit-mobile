import {
  canTransition,
  checklistProgress,
  compareJobs,
  isOverdue,
  isTerminal,
  nextStatuses,
  validateCompletion,
} from "@/domain/jobs";
import { buildSeedJobs } from "@/domain/seed";
import type { Job } from "@/domain/types";

const NOW = Date.parse("2026-10-27T08:00:00.000Z");

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_001",
    reference: "FK-2400",
    title: "Annual boiler service",
    customerName: "Harbour Point Retail",
    siteAddress: "14 Quayside Parade, Bristol",
    scheduledFor: "2026-10-27T09:00:00.000Z",
    priority: "normal",
    status: "on_site",
    assigneeId: "tech_morgan",
    checklist: [
      { id: "c1", label: "Isolate supply", required: true, done: true },
      { id: "c2", label: "Tidy up", required: false, done: false },
    ],
    notes: [],
    completionNotes: "Serviced the unit and confirmed safe operation.",
    updatedAt: "2026-10-27T07:00:00.000Z",
    rev: 1,
    ...overrides,
  };
}

describe("status transitions", () => {
  it("allows the real field workflow", () => {
    expect(canTransition("scheduled", "en_route")).toBe(true);
    expect(canTransition("en_route", "on_site")).toBe(true);
    expect(canTransition("on_site", "completed")).toBe(true);
  });

  it("refuses to skip the site visit", () => {
    expect(canTransition("scheduled", "completed")).toBe(false);
    expect(canTransition("en_route", "completed")).toBe(false);
  });

  it("lets a blocked job rejoin the workflow at any open stage", () => {
    expect(nextStatuses("blocked")).toEqual(
      expect.arrayContaining(["scheduled", "en_route", "on_site"]),
    );
  });

  it("treats completed and cancelled as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(nextStatuses("completed")).toEqual([]);
    expect(isTerminal("blocked")).toBe(false);
  });
});

describe("completion rules", () => {
  it("accepts a job that is on site, ticked off and written up", () => {
    expect(validateCompletion(job()).ok).toBe(true);
  });

  it("refuses to complete a job the technician has not arrived at", () => {
    const result = validateCompletion(job({ status: "scheduled" }));
    expect(result.ok).toBe(false);
    expect(result.errors.status).toMatch(/cannot be completed/i);
  });

  it("refuses while a required checklist item is outstanding", () => {
    const result = validateCompletion(
      job({
        checklist: [
          { id: "c1", label: "Isolate supply", required: true, done: false },
          { id: "c2", label: "Tidy up", required: false, done: false },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.checklist).toMatch(/1 required item is still outstanding/);
  });

  it("ignores optional items that are still outstanding", () => {
    expect(validateCompletion(job()).ok).toBe(true);
  });

  it("requires a real completion write-up", () => {
    const result = validateCompletion(job({ completionNotes: "done" }));
    expect(result.ok).toBe(false);
    expect(result.errors.completionNotes).toMatch(/at least 15 characters/);
  });

  it("reports every failing rule at once, not just the first", () => {
    const result = validateCompletion(
      job({
        status: "scheduled",
        completionNotes: "",
        checklist: [{ id: "c1", label: "x", required: true, done: false }],
      }),
    );
    expect(Object.keys(result.errors).sort()).toEqual([
      "checklist",
      "completionNotes",
      "status",
    ]);
  });
});

describe("checklistProgress", () => {
  it("counts done, total and outstanding required items", () => {
    expect(
      checklistProgress([
        { id: "a", label: "a", required: true, done: true },
        { id: "b", label: "b", required: true, done: false },
        { id: "c", label: "c", required: false, done: false },
      ]),
    ).toEqual({ done: 1, total: 3, requiredOutstanding: 1 });
  });

  it("handles an empty checklist", () => {
    expect(checklistProgress([])).toEqual({
      done: 0,
      total: 0,
      requiredOutstanding: 0,
    });
  });
});

describe("isOverdue", () => {
  it("is true for an open job whose slot has passed", () => {
    expect(isOverdue(job({ scheduledFor: "2026-10-26T09:00:00.000Z" }), NOW)).toBe(true);
  });

  it("is false for a future job", () => {
    expect(isOverdue(job({ scheduledFor: "2026-10-28T09:00:00.000Z" }), NOW)).toBe(false);
  });

  it("is never true for finished work, however old", () => {
    expect(
      isOverdue(
        job({ status: "completed", scheduledFor: "2020-01-01T09:00:00.000Z" }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("compareJobs", () => {
  it("puts open work above finished work regardless of priority", () => {
    const finishedEmergency = job({ id: "a", status: "completed", priority: "emergency" });
    const openLow = job({ id: "b", status: "scheduled", priority: "low" });
    expect([finishedEmergency, openLow].sort(compareJobs)[0]!.id).toBe("b");
  });

  it("orders open work by priority, then by schedule", () => {
    const sorted = [
      job({ id: "normal", priority: "normal", status: "scheduled" }),
      job({ id: "emergency", priority: "emergency", status: "scheduled" }),
      job({ id: "high", priority: "high", status: "scheduled" }),
    ].sort(compareJobs);
    expect(sorted.map((entry) => entry.id)).toEqual(["emergency", "high", "normal"]);
  });

  it("is a total order, so list positions never flicker", () => {
    const a = job({ id: "a" });
    const b = job({ id: "b" });
    expect(compareJobs(a, b)).toBeLessThan(0);
    expect(compareJobs(b, a)).toBeGreaterThan(0);
    expect(compareJobs(a, a)).toBe(0);
  });
});

describe("seed data", () => {
  it("is deterministic", () => {
    expect(buildSeedJobs(NOW)).toEqual(buildSeedJobs(NOW));
  });

  it("covers the states a technician's day actually contains", () => {
    const jobs = buildSeedJobs(NOW);
    const statuses = new Set(jobs.map((entry) => entry.status));
    expect(jobs).toHaveLength(14);
    expect(statuses).toEqual(
      new Set(["on_site", "en_route", "blocked", "scheduled", "completed"]),
    );
    expect(jobs.some((entry) => isOverdue(entry, NOW))).toBe(true);
    expect(jobs.some((entry) => entry.priority === "emergency")).toBe(true);
  });

  it("starts every job at revision 1 with the office as the source of truth", () => {
    expect(buildSeedJobs(NOW).every((entry) => entry.rev === 1)).toBe(true);
  });
});
