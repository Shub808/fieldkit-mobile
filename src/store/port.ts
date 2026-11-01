import type { Conflict, Job, Mutation } from "@/domain/types";

/**
 * The persistence port.
 *
 * Everything above this interface — the sync engine, the hooks, the screens —
 * depends on these five concepts and nothing else. That is what lets the same
 * contract test suite run against every adapter, and what makes swapping
 * AsyncStorage for SQLite a change to one file rather than a migration.
 *
 * All methods are async because the device adapters are; the in-memory one
 * matches the shape so the tests exercise the same code paths.
 */
export interface LocalStore {
  /** Every job held on the device, including ones synced long ago. */
  readJobs(): Promise<Job[]>;
  writeJobs(jobs: Job[]): Promise<void>;

  /**
   * The last server-confirmed copy of each job, keyed by id.
   *
   * This is the "base" of a three-way merge: without it the device can see
   * that its copy and the server's copy differ, but not which side actually
   * changed — and merging without that is how offline apps overwrite other
   * people's edits.
   */
  readBaseline(): Promise<Record<string, Job>>;
  writeBaseline(baseline: Record<string, Job>): Promise<void>;

  /** Pending local mutations, oldest first. */
  readOutbox(): Promise<Mutation[]>;
  writeOutbox(outbox: Mutation[]): Promise<void>;

  /** Conflicts awaiting a human decision. */
  readConflicts(): Promise<Conflict[]>;
  writeConflicts(conflicts: Conflict[]): Promise<void>;

  /** Scalar metadata (last sync time, schema version). */
  readMeta<T>(key: string): Promise<T | null>;
  writeMeta<T>(key: string, value: T): Promise<void>;

  /** Wipes everything. Used by the demo reset and by tests. */
  clear(): Promise<void>;
}

export const STORE_KEYS = {
  jobs: "fieldkit.jobs",
  baseline: "fieldkit.baseline",
  outbox: "fieldkit.outbox",
  conflicts: "fieldkit.conflicts",
  meta: "fieldkit.meta",
} as const;
