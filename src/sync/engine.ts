import { applyMutation } from "@/remote/simulated-remote";
import {
  NetworkError,
  ServerError,
  type RemoteApi,
} from "@/remote/types";
import type {
  Conflict,
  Job,
  Mutation,
  MutationKind,
  SyncState,
} from "@/domain/types";
import type { LocalStore } from "@/store/port";
import { backoffDelayMs, hasRetriesLeft, type Random } from "@/sync/backoff";
import { mergeJob, resolveConflict } from "@/sync/merge";

/**
 * The sync engine.
 *
 * The contract it keeps, which is the whole point of an offline-first app:
 *
 *  1. **Every write lands locally first and immediately.** The technician is
 *     never waiting on a network they may not have. `enqueue()` applies the
 *     mutation to the local copy using the *same* function the server runs,
 *     so the optimistic result and the eventual server result agree.
 *  2. **Nothing is lost.** Unsent work sits in a durable outbox, in order,
 *     and survives the app being killed.
 *  3. **Failure is normal, not exceptional.** A network error stops the drain
 *     and leaves the queue intact; a server error retries with exponential
 *     backoff and jitter; a rejection that can never succeed is dead-lettered
 *     and surfaced rather than retried forever.
 *  4. **Nobody's edit is silently discarded.** A revision conflict triggers a
 *     three-way merge; fields only one side touched merge automatically, and
 *     genuinely competing edits are held for a human.
 *
 * It is a plain class over two injected ports (`LocalStore`, `RemoteApi`) with
 * injected clock and randomness, so all of the above is tested in Node without
 * a device, a network or a fake timer in sight.
 */

export interface EngineOptions {
  now: () => number;
  random: Random;
  newId: () => string;
}

export interface DrainReport {
  pushed: number;
  conflicts: number;
  retried: number;
  deadLettered: number;
  stoppedBecauseOffline: boolean;
}

export interface PullReport {
  received: number;
  merged: number;
  conflicts: number;
}

export const META_LAST_PULLED = "lastPulledAt";
export const META_LAST_SYNCED = "lastSyncedAt";

let fallbackCounter = 0;

const DEFAULTS: EngineOptions = {
  now: Date.now,
  random: Math.random,
  newId: () =>
    globalThis.crypto?.randomUUID?.() ??
    `id_${Date.now().toString(36)}_${(fallbackCounter += 1)}`,
};

export class SyncEngine {
  readonly #store: LocalStore;
  readonly #remote: RemoteApi;
  readonly #options: EngineOptions;
  /** Guards against two drains interleaving over the same outbox. */
  #draining: Promise<DrainReport> | null = null;

  constructor(
    store: LocalStore,
    remote: RemoteApi,
    options: Partial<EngineOptions> = {},
  ) {
    this.#store = store;
    this.#remote = remote;
    this.#options = { ...DEFAULTS, ...options };
  }

  // ---------------------------------------------------------------- local

  /**
   * Applies a mutation locally and queues it for the server.
   *
   * Returns the updated job, or an error when the mutation is invalid — which
   * is caught here, offline, rather than being discovered hours later when
   * the queue finally drains.
   */
  async enqueue(
    jobId: string,
    kind: MutationKind,
    payload: Record<string, unknown>,
  ): Promise<{ ok: true; job: Job } | { ok: false; reason: string }> {
    const jobs = await this.#store.readJobs();
    const index = jobs.findIndex((job) => job.id === jobId);
    if (index === -1) return { ok: false, reason: "That job is not on this device." };

    const current = jobs[index]!;
    const mutation: Mutation = {
      id: this.#options.newId(),
      jobId,
      kind,
      payload,
      createdAt: new Date(this.#options.now()).toISOString(),
      // The revision the server last confirmed, not the local one: that is
      // what lets the server tell whether this device was up to date.
      baseRev: await this.#baseRevFor(jobId, current.rev),
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      deadLettered: false,
    };

    const outcome = applyMutation(current, mutation, this.#options.now());
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    // `applyMutation` bumps `rev`; locally that is not ours to assign, so the
    // server's revision is preserved and only the content changes.
    const optimistic: Job = { ...outcome.job, rev: current.rev };
    jobs[index] = optimistic;
    await this.#store.writeJobs(jobs);

    const outbox = await this.#store.readOutbox();
    await this.#store.writeOutbox([...outbox, mutation]);

    return { ok: true, job: optimistic };
  }

  async #baseRevFor(jobId: string, fallback: number): Promise<number> {
    const baseline = await this.#store.readBaseline();
    return baseline[jobId]?.rev ?? fallback;
  }

  // ----------------------------------------------------------------- pull

  /** Fetches server changes and merges them into the local copy. */
  async pull(): Promise<PullReport> {
    const since = await this.#store.readMeta<string>(META_LAST_PULLED);
    const incoming = await this.#remote.pull(since);

    const jobs = await this.#store.readJobs();
    const baseline = await this.#store.readBaseline();
    const conflicts = await this.#store.readConflicts();
    const byId = new Map(jobs.map((job) => [job.id, job]));

    let merged = 0;
    let newConflicts = 0;

    for (const theirs of incoming) {
      const mine = byId.get(theirs.id);

      if (!mine) {
        byId.set(theirs.id, theirs);
        baseline[theirs.id] = structuredClone(theirs);
        merged += 1;
        continue;
      }

      const base = baseline[theirs.id] ?? structuredClone(mine);
      const outcome = mergeJob(base, mine, theirs);
      byId.set(theirs.id, outcome.merged);
      // The baseline always becomes the server's copy, conflicts or not:
      // that is what the next merge has to be measured against.
      baseline[theirs.id] = structuredClone(theirs);
      if (outcome.changedFromServer) merged += 1;

      for (const conflict of outcome.conflicts) {
        // Re-detecting the same conflict on every pull would bury the user.
        const alreadyKnown = conflicts.some(
          (existing) =>
            existing.jobId === conflict.jobId &&
            existing.field === conflict.field &&
            JSON.stringify(existing.theirs) === JSON.stringify(conflict.theirs),
        );
        if (alreadyKnown) continue;
        conflicts.push({
          ...conflict,
          id: this.#options.newId(),
          detectedAt: new Date(this.#options.now()).toISOString(),
        });
        newConflicts += 1;
      }
    }

    await this.#store.writeJobs([...byId.values()]);
    await this.#store.writeBaseline(baseline);
    await this.#store.writeConflicts(conflicts);
    await this.#store.writeMeta(
      META_LAST_PULLED,
      new Date(this.#options.now()).toISOString(),
    );

    return { received: incoming.length, merged, conflicts: newConflicts };
  }

  // ----------------------------------------------------------------- push

  /** Sends queued mutations, oldest first. Safe to call concurrently. */
  drain(): Promise<DrainReport> {
    this.#draining ??= this.#drain().finally(() => {
      this.#draining = null;
    });
    return this.#draining;
  }

  async #drain(): Promise<DrainReport> {
    const report: DrainReport = {
      pushed: 0,
      conflicts: 0,
      retried: 0,
      deadLettered: 0,
      stoppedBecauseOffline: false,
    };

    let outbox = await this.#store.readOutbox();
    const nowMs = this.#options.now();
    let offline = false;

    for (const queued of [...outbox]) {
      if (queued.deadLettered) continue;
      if (queued.nextAttemptAt > nowMs) continue;

      // A clean rebase re-points the mutation at the server's new revision,
      // and it is then worth one immediate re-attempt inside this same drain
      // rather than making the technician wait for the next one.
      let mutation = queued;
      let attemptsThisDrain = 0;

      while (true) {
      attemptsThisDrain += 1;
      let result;
      try {
        result = await this.#remote.push({ ...mutation, attempts: mutation.attempts + 1 });
      } catch (error) {
        if (error instanceof NetworkError) {
          // No point working through the rest of the queue; stop and keep it.
          report.stoppedBecauseOffline = true;
          offline = true;
          break;
        }
        const reason =
          error instanceof ServerError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unknown error";
        outbox = await this.#scheduleRetry(mutation, reason);
        report.retried += 1;
        if (outbox.find((entry) => entry.id === mutation.id)?.deadLettered) {
          report.deadLettered += 1;
        }
        break;
      }

      if (result.status === "applied") {
        await this.#acceptServerJob(result.job);
        outbox = await this.#removeFromOutbox(mutation.id);
        // Anything still queued for this job was written against the old
        // revision. Those changes are stacked on top of the one that just
        // landed, not competing with it, so they are re-pointed at the new
        // revision rather than being made to conflict with the device's own
        // previous write.
        outbox = await this.#rebaseQueued(mutation.jobId, result.job.rev, mutation.id);
        report.pushed += 1;
        break;
      }

      if (result.status === "rejected") {
        // A rejection is permanent: retrying it would never succeed.
        outbox = await this.#deadLetter(mutation, result.reason);
        report.deadLettered += 1;
        if (result.serverJob) await this.#acceptServerJob(result.serverJob);
        break;
      }

      // Conflict: rebase this mutation on the server's current copy.
      const rebased = await this.#rebase(mutation, result.serverJob);
      outbox = rebased.outbox;
      if (rebased.conflicted) {
        report.conflicts += 1;
        break;
      }

      const updated = outbox.find((entry) => entry.id === mutation.id);
      // One immediate re-attempt; beyond that the queue waits, so a server
      // whose revision keeps moving cannot spin this loop.
      if (!updated || attemptsThisDrain >= 2) break;
      mutation = updated;
      }

      if (offline) break;
    }

    await this.#store.writeMeta(
      META_LAST_SYNCED,
      new Date(this.#options.now()).toISOString(),
    );
    return report;
  }

  /**
   * Handles a revision conflict for one queued mutation.
   *
   * The server's copy is merged with the device's. If the merge is clean — the
   * two sides touched different fields — the mutation is re-pointed at the new
   * revision and will be retried, so the technician's change still lands.
   * If the same field moved on both sides, the mutation is dropped (its intent
   * is already captured in the conflict) and a human decides.
   */
  async #rebase(
    mutation: Mutation,
    serverJob: Job,
  ): Promise<{ outbox: Mutation[]; conflicted: boolean }> {
    const jobs = await this.#store.readJobs();
    const baseline = await this.#store.readBaseline();
    const index = jobs.findIndex((job) => job.id === mutation.jobId);
    const mine = index === -1 ? serverJob : jobs[index]!;
    const base = baseline[mutation.jobId] ?? structuredClone(serverJob);

    const outcome = mergeJob(base, mine, serverJob);
    if (index !== -1) jobs[index] = outcome.merged;
    baseline[mutation.jobId] = structuredClone(serverJob);

    await this.#store.writeJobs(jobs);
    await this.#store.writeBaseline(baseline);

    const relevant = outcome.conflicts.filter((conflict) =>
      conflictTouchesMutation(conflict.field, mutation.kind),
    );

    if (relevant.length === 0) {
      const outbox = (await this.#store.readOutbox()).map((entry) =>
        entry.id === mutation.id
          ? { ...entry, baseRev: serverJob.rev, lastError: null, nextAttemptAt: 0 }
          : entry,
      );
      await this.#store.writeOutbox(outbox);
      return { outbox, conflicted: false };
    }

    const conflicts = await this.#store.readConflicts();
    for (const conflict of relevant) {
      conflicts.push({
        ...conflict,
        id: this.#options.newId(),
        detectedAt: new Date(this.#options.now()).toISOString(),
      });
    }
    await this.#store.writeConflicts(conflicts);

    const outbox = await this.#removeFromOutbox(mutation.id);
    return { outbox, conflicted: true };
  }

  async #acceptServerJob(job: Job): Promise<void> {
    const jobs = await this.#store.readJobs();
    const index = jobs.findIndex((existing) => existing.id === job.id);
    if (index === -1) jobs.push(job);
    else jobs[index] = job;

    const baseline = await this.#store.readBaseline();
    baseline[job.id] = structuredClone(job);

    await this.#store.writeJobs(jobs);
    await this.#store.writeBaseline(baseline);
  }

  /**
   * Re-points still-queued mutations for a job at a newer server revision.
   *
   * Called after one of this device's own mutations lands: the rest of the
   * queue for that job was written against the previous revision, but it
   * represents work stacked on top of what just landed, not a competing edit.
   */
  async #rebaseQueued(
    jobId: string,
    rev: number,
    exceptId: string,
  ): Promise<Mutation[]> {
    const outbox = (await this.#store.readOutbox()).map((entry) =>
      entry.jobId === jobId && entry.id !== exceptId && !entry.deadLettered
        ? { ...entry, baseRev: rev }
        : entry,
    );
    await this.#store.writeOutbox(outbox);
    return outbox;
  }

  async #removeFromOutbox(mutationId: string): Promise<Mutation[]> {
    const outbox = (await this.#store.readOutbox()).filter(
      (entry) => entry.id !== mutationId,
    );
    await this.#store.writeOutbox(outbox);
    return outbox;
  }

  async #scheduleRetry(mutation: Mutation, reason: string): Promise<Mutation[]> {
    const attempts = mutation.attempts + 1;
    const keepTrying = hasRetriesLeft(attempts);
    const outbox = (await this.#store.readOutbox()).map((entry) =>
      entry.id === mutation.id
        ? {
            ...entry,
            attempts,
            lastError: reason,
            deadLettered: !keepTrying,
            nextAttemptAt: keepTrying
              ? this.#options.now() + backoffDelayMs(attempts, this.#options.random)
              : entry.nextAttemptAt,
          }
        : entry,
    );
    await this.#store.writeOutbox(outbox);
    return outbox;
  }

  async #deadLetter(mutation: Mutation, reason: string): Promise<Mutation[]> {
    const outbox = (await this.#store.readOutbox()).map((entry) =>
      entry.id === mutation.id
        ? { ...entry, deadLettered: true, lastError: reason }
        : entry,
    );
    await this.#store.writeOutbox(outbox);
    return outbox;
  }

  // ------------------------------------------------------------ conflicts

  /** Applies a human's decision and re-queues the result if it was theirs. */
  async resolve(
    conflictId: string,
    resolution: "keep_mine" | "keep_theirs",
  ): Promise<Job | null> {
    const conflicts = await this.#store.readConflicts();
    const conflict = conflicts.find((entry) => entry.id === conflictId);
    if (!conflict) return null;

    const jobs = await this.#store.readJobs();
    const index = jobs.findIndex((job) => job.id === conflict.jobId);
    if (index === -1) return null;

    const updated = resolveConflict(jobs[index]!, conflict, resolution);
    jobs[index] = updated;

    await this.#store.writeJobs(jobs);
    await this.#store.writeConflicts(
      conflicts.filter((entry) => entry.id !== conflictId),
    );

    // Choosing the device's value means that value still has to reach the
    // server, so it goes back on the queue against the current revision.
    if (resolution === "keep_mine") {
      await this.#requeueResolved(conflict.jobId, conflict.field, conflict.mine);
    }

    return updated;
  }

  async #requeueResolved(
    jobId: string,
    field: Conflict["field"],
    value: unknown,
  ): Promise<void> {
    // Only scalar fields can be the subject of a conflict, and of those only
    // status and priority are expressible as a mutation the server accepts.
    const kind: MutationKind | null =
      field === "status" ? "set_status" : field === "priority" ? "set_priority" : null;
    if (!kind) return;

    const baseline = await this.#store.readBaseline();
    const baseRev = baseline[jobId]?.rev ?? 0;
    const payload: Record<string, unknown> =
      kind === "set_status" ? { status: value } : { priority: value };

    const outbox = await this.#store.readOutbox();
    await this.#store.writeOutbox([
      ...outbox,
      {
        id: this.#options.newId(),
        jobId,
        kind,
        payload,
        createdAt: new Date(this.#options.now()).toISOString(),
        baseRev,
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        deadLettered: false,
      },
    ]);
  }

  /** Clears a dead-lettered mutation the user has acknowledged. */
  async discard(mutationId: string): Promise<void> {
    await this.#removeFromOutbox(mutationId);
  }

  // --------------------------------------------------------------- status

  async state(online: boolean, phase: SyncState["phase"] = "idle"): Promise<SyncState> {
    const outbox = await this.#store.readOutbox();
    const conflicts = await this.#store.readConflicts();
    const pending = outbox.filter((entry) => !entry.deadLettered);
    const dead = outbox.filter((entry) => entry.deadLettered);
    return {
      phase: online ? phase : "offline",
      pending: pending.length,
      deadLettered: dead.length,
      conflicts: conflicts.length,
      lastSyncedAt: await this.#store.readMeta<string>(META_LAST_SYNCED),
      lastError: pending.find((entry) => entry.lastError)?.lastError ?? null,
    };
  }
}

/** Whether a conflicted field is the one this mutation was trying to change. */
function conflictTouchesMutation(
  field: Conflict["field"],
  kind: MutationKind,
): boolean {
  switch (kind) {
    case "set_status":
    case "complete_job":
      return field === "status" || field === "completionNotes";
    case "set_priority":
      return field === "priority";
    case "toggle_checklist":
      // Checklist ticks always merge (a boolean cannot three-way conflict),
      // so such a mutation is simply rebased onto the new revision.
      return false;
    case "add_note":
      // Notes are append-only and merge by union, so they never conflict.
      return false;
  }
}
