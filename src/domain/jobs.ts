import {
  JOB_STATUSES,
  type ChecklistItem,
  type Job,
  type JobStatus,
} from "@/domain/types";

/**
 * Job business rules.
 *
 * These are pure functions over a job, kept apart from both the UI and the
 * sync engine. A technician's device enforces them locally so the app stays
 * correct while offline, and the simulated remote enforces the same rules so
 * the two cannot drift.
 */

/**
 * Allowed status transitions.
 *
 * Expressed as an adjacency map rather than scattered `if` checks, so the
 * whole workflow is one readable thing and an illegal transition is a data
 * question rather than a code-path question.
 */
export const STATUS_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  scheduled: ["en_route", "blocked", "cancelled"],
  en_route: ["on_site", "blocked", "scheduled"],
  on_site: ["completed", "blocked"],
  blocked: ["scheduled", "en_route", "on_site", "cancelled"],
  // Terminal states. Reopening a job is a back-office action, not a field one.
  completed: [],
  cancelled: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: JobStatus): readonly JobStatus[] {
  return STATUS_TRANSITIONS[from];
}

export function isTerminal(status: JobStatus): boolean {
  return STATUS_TRANSITIONS[status].length === 0;
}

export interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<"status" | "completionNotes" | "checklist", string>>;
}

export const MIN_COMPLETION_NOTES = 15;

/**
 * Whether a job may be completed.
 *
 * Two rules, both of which exist because the paperwork is the point: every
 * required checklist item must be ticked, and the completion notes must say
 * something. They are enforced here — on the device, offline — rather than
 * only at the server, because a technician discovering at the end of the day
 * that nothing they filed was accepted is the worst possible time to find out.
 */
export function validateCompletion(job: Job): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (!canTransition(job.status, "completed")) {
    errors.status = `A job that is ${job.status.replace("_", " ")} cannot be completed. Arrive on site first.`;
  }

  const outstanding = job.checklist.filter(
    (item) => item.required && !item.done,
  );
  if (outstanding.length > 0) {
    errors.checklist = `${outstanding.length} required ${
      outstanding.length === 1 ? "item is" : "items are"
    } still outstanding.`;
  }

  if (job.completionNotes.trim().length < MIN_COMPLETION_NOTES) {
    errors.completionNotes = `Describe what was done in at least ${MIN_COMPLETION_NOTES} characters.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function checklistProgress(items: ChecklistItem[]): {
  done: number;
  total: number;
  requiredOutstanding: number;
} {
  return {
    done: items.filter((item) => item.done).length,
    total: items.length,
    requiredOutstanding: items.filter((item) => item.required && !item.done)
      .length,
  };
}

/** True when the job's scheduled visit is in the past and it is still open. */
export function isOverdue(job: Job, now: number): boolean {
  if (isTerminal(job.status)) return false;
  return new Date(job.scheduledFor).getTime() < now;
}

export function isJobStatus(value: unknown): value is JobStatus {
  return (
    typeof value === "string" &&
    (JOB_STATUSES as readonly string[]).includes(value)
  );
}

/** Stable ordering for the job list: emergencies first, then by schedule. */
const PRIORITY_RANK: Record<Job["priority"], number> = {
  emergency: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function compareJobs(a: Job, b: Job): number {
  // Open work always sorts above finished work, whatever its priority.
  const aDone = isTerminal(a.status) ? 1 : 0;
  const bDone = isTerminal(b.status) ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;

  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;

  const bySchedule = a.scheduledFor.localeCompare(b.scheduledFor);
  if (bySchedule !== 0) return bySchedule;

  return a.id.localeCompare(b.id);
}
