import { canTransition, validateCompletion } from "@/domain/jobs";
import type { ChecklistItem, Job, JobNote, Mutation } from "@/domain/types";
import {
  NetworkError,
  ServerError,
  type PushResult,
  type RemoteApi,
} from "@/remote/types";

/**
 * A simulated field-service backend.
 *
 * There is no real server behind this app, and pretending otherwise would be
 * dishonest. What this is instead is a backend you can *break on purpose*:
 * the Settings screen drives the knobs below, so a reviewer can pull the plug,
 * add a second of latency, make one request in three fail, or have the office
 * edit a job behind the technician's back — and watch the queue, the retries
 * and the conflict resolution actually handle it.
 *
 * It enforces the same domain rules as the device (`domain/jobs.ts`), so the
 * two cannot quietly disagree about what a legal transition is.
 */

export interface RemoteOptions {
  /** Every call throws `NetworkError`. */
  offline: boolean;
  latencyMs: number;
  /** Probability in [0, 1] that a call fails with a 503. */
  failureRate: number;
  /** Injected so failures are reproducible in tests. */
  random: () => number;
  now: () => number;
}

const DEFAULTS: RemoteOptions = {
  offline: false,
  latencyMs: 0,
  failureRate: 0,
  random: Math.random,
  now: Date.now,
};

export class SimulatedRemote implements RemoteApi {
  #jobs = new Map<string, Job>();
  /** Idempotency ledger: mutation id → the result it produced. */
  #applied = new Map<string, PushResult>();
  #options: RemoteOptions;

  constructor(seed: Job[], options: Partial<RemoteOptions> = {}) {
    this.#options = { ...DEFAULTS, ...options };
    for (const job of seed) this.#jobs.set(job.id, structuredClone(job));
  }

  configure(options: Partial<RemoteOptions>): void {
    this.#options = { ...this.#options, ...options };
  }

  get options(): Readonly<RemoteOptions> {
    return this.#options;
  }

  /** Test and demo hook: the office edits a job while the device is away. */
  applyRemoteEdit(jobId: string, patch: Partial<Job>): Job | null {
    const current = this.#jobs.get(jobId);
    if (!current) return null;
    const next: Job = {
      ...current,
      ...patch,
      rev: current.rev + 1,
      updatedAt: new Date(this.#options.now()).toISOString(),
    };
    this.#jobs.set(jobId, next);
    return structuredClone(next);
  }

  snapshot(): Job[] {
    return [...this.#jobs.values()].map((job) => structuredClone(job));
  }

  async #transport(): Promise<void> {
    if (this.#options.offline) throw new NetworkError();
    if (this.#options.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.#options.latencyMs));
    }
    if (this.#options.random() < this.#options.failureRate) {
      throw new ServerError(503, "The service is temporarily unavailable.");
    }
  }

  async pull(since: string | null): Promise<Job[]> {
    await this.#transport();
    const all = this.snapshot();
    if (!since) return all;
    return all.filter((job) => job.updatedAt >= since);
  }

  async push(mutation: Mutation): Promise<PushResult> {
    await this.#transport();

    // Idempotency: a retry after a response that never arrived must not
    // apply the change twice. The client reuses the mutation id as its key.
    const previous = this.#applied.get(mutation.id);
    if (previous) return structuredClone(previous);

    const current = this.#jobs.get(mutation.jobId);
    if (!current) {
      const result: PushResult = {
        status: "rejected",
        reason: "That job no longer exists.",
        serverJob: null,
      };
      this.#applied.set(mutation.id, result);
      return structuredClone(result);
    }

    if (current.rev !== mutation.baseRev) {
      // Not recorded in the idempotency ledger: a conflict is a transient
      // state the client resolves and retries from a new base.
      return { status: "conflict", serverJob: structuredClone(current) };
    }

    const outcome = applyMutation(current, mutation, this.#options.now());
    if (!outcome.ok) {
      const result: PushResult = {
        status: "rejected",
        reason: outcome.reason,
        serverJob: structuredClone(current),
      };
      this.#applied.set(mutation.id, result);
      return structuredClone(result);
    }

    this.#jobs.set(outcome.job.id, outcome.job);
    const result: PushResult = { status: "applied", job: structuredClone(outcome.job) };
    this.#applied.set(mutation.id, result);
    return structuredClone(result);
  }
}

type ApplyOutcome =
  | { ok: true; job: Job }
  | { ok: false; reason: string };

/**
 * Applies one mutation server-side.
 *
 * Exported so the device can run the identical logic locally — that is what
 * makes an optimistic local write and the eventual server write agree.
 */
export function applyMutation(
  current: Job,
  mutation: Mutation,
  nowMs: number,
): ApplyOutcome {
  const now = new Date(nowMs).toISOString();
  const next: Job = structuredClone(current);

  switch (mutation.kind) {
    case "set_status": {
      const status = mutation.payload.status as Job["status"];
      if (!canTransition(current.status, status)) {
        return {
          ok: false,
          reason: `Cannot move a ${current.status.replace("_", " ")} job to ${status.replace("_", " ")}.`,
        };
      }
      next.status = status;
      break;
    }

    case "set_priority": {
      next.priority = mutation.payload.priority as Job["priority"];
      break;
    }

    case "toggle_checklist": {
      const itemId = mutation.payload.itemId as string;
      const done = mutation.payload.done as boolean;
      const found = next.checklist.some((item) => item.id === itemId);
      if (!found) {
        return { ok: false, reason: "That checklist item no longer exists." };
      }
      next.checklist = next.checklist.map((item: ChecklistItem) =>
        item.id === itemId ? { ...item, done } : item,
      );
      break;
    }

    case "add_note": {
      const note = mutation.payload.note as JobNote;
      // Appending the same note twice is a no-op, not an error: a retried
      // push must be safe even if the ledger were lost.
      if (!next.notes.some((existing) => existing.id === note.id)) {
        next.notes = [...next.notes, note];
      }
      break;
    }

    case "complete_job": {
      const completionNotes = mutation.payload.completionNotes as string;
      const candidate: Job = { ...next, completionNotes };
      const validation = validateCompletion(candidate);
      if (!validation.ok) {
        return {
          ok: false,
          reason:
            Object.values(validation.errors)[0] ??
            "This job is not ready to be completed.",
        };
      }
      next.completionNotes = completionNotes;
      next.status = "completed";
      break;
    }
  }

  next.rev = current.rev + 1;
  next.updatedAt = now;
  return { ok: true, job: next };
}
