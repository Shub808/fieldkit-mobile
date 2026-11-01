import type { Conflict, Job, Mutation } from "@/domain/types";
import type { LocalStore } from "@/store/port";

/**
 * In-memory adapter.
 *
 * Used by the test suite and as the fallback when no persistent storage is
 * available. Every value is cloned on the way in and on the way out: a store
 * that hands back a live reference lets a caller mutate "persisted" state
 * without going through the store, which hides real bugs until the day the
 * adapter is swapped for one that actually serialises.
 */
export class MemoryStore implements LocalStore {
  #jobs: Job[] = [];
  #baseline: Record<string, Job> = {};
  #outbox: Mutation[] = [];
  #conflicts: Conflict[] = [];
  #meta = new Map<string, unknown>();

  async readJobs(): Promise<Job[]> {
    return clone(this.#jobs);
  }

  async writeJobs(jobs: Job[]): Promise<void> {
    this.#jobs = clone(jobs);
  }

  async readBaseline(): Promise<Record<string, Job>> {
    return clone(this.#baseline);
  }

  async writeBaseline(baseline: Record<string, Job>): Promise<void> {
    this.#baseline = clone(baseline);
  }

  async readOutbox(): Promise<Mutation[]> {
    return clone(this.#outbox);
  }

  async writeOutbox(outbox: Mutation[]): Promise<void> {
    this.#outbox = clone(outbox);
  }

  async readConflicts(): Promise<Conflict[]> {
    return clone(this.#conflicts);
  }

  async writeConflicts(conflicts: Conflict[]): Promise<void> {
    this.#conflicts = clone(conflicts);
  }

  async readMeta<T>(key: string): Promise<T | null> {
    return (this.#meta.get(key) as T | undefined) ?? null;
  }

  async writeMeta<T>(key: string, value: T): Promise<void> {
    this.#meta.set(key, clone(value));
  }

  async clear(): Promise<void> {
    this.#jobs = [];
    this.#baseline = {};
    this.#outbox = [];
    this.#conflicts = [];
    this.#meta.clear();
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
