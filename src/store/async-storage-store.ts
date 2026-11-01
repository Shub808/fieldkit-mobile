import type { Conflict, Job, Mutation } from "@/domain/types";
import { STORE_KEYS, type LocalStore } from "@/store/port";

/**
 * The minimal slice of AsyncStorage this adapter needs.
 *
 * Declared structurally rather than imported as a type so the adapter can be
 * driven by a fake in tests — the same contract suite then runs against the
 * real serialisation code, not just the in-memory shortcut.
 */
export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * JSON-over-key-value adapter.
 *
 * Deliberately conservative about reads: stored JSON can be corrupt (a write
 * interrupted by the OS killing a backgrounded app), the wrong shape (an
 * older build), or simply absent. Every read falls back to an empty value
 * rather than throwing, because a technician opening the app to an exception
 * has lost their whole day's work as far as they are concerned.
 */
export class AsyncStorageStore implements LocalStore {
  readonly #backend: KeyValueBackend;

  constructor(backend: KeyValueBackend) {
    this.#backend = backend;
  }

  async #read<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await this.#backend.getItem(key);
      if (raw === null) return fallback;
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || parsed === undefined) return fallback;
      // Shape guard: an array key must hold an array, an object key an object.
      if (Array.isArray(fallback) !== Array.isArray(parsed)) return fallback;
      return parsed as T;
    } catch {
      return fallback;
    }
  }

  async #write(key: string, value: unknown): Promise<void> {
    await this.#backend.setItem(key, JSON.stringify(value));
  }

  readJobs(): Promise<Job[]> {
    return this.#read<Job[]>(STORE_KEYS.jobs, []);
  }

  writeJobs(jobs: Job[]): Promise<void> {
    return this.#write(STORE_KEYS.jobs, jobs);
  }

  readBaseline(): Promise<Record<string, Job>> {
    return this.#read<Record<string, Job>>(STORE_KEYS.baseline, {});
  }

  writeBaseline(baseline: Record<string, Job>): Promise<void> {
    return this.#write(STORE_KEYS.baseline, baseline);
  }

  readOutbox(): Promise<Mutation[]> {
    return this.#read<Mutation[]>(STORE_KEYS.outbox, []);
  }

  writeOutbox(outbox: Mutation[]): Promise<void> {
    return this.#write(STORE_KEYS.outbox, outbox);
  }

  readConflicts(): Promise<Conflict[]> {
    return this.#read<Conflict[]>(STORE_KEYS.conflicts, []);
  }

  writeConflicts(conflicts: Conflict[]): Promise<void> {
    return this.#write(STORE_KEYS.conflicts, conflicts);
  }

  async readMeta<T>(key: string): Promise<T | null> {
    const meta = await this.#read<Record<string, unknown>>(STORE_KEYS.meta, {});
    return (meta[key] as T | undefined) ?? null;
  }

  async writeMeta<T>(key: string, value: T): Promise<void> {
    const meta = await this.#read<Record<string, unknown>>(STORE_KEYS.meta, {});
    meta[key] = value;
    await this.#write(STORE_KEYS.meta, meta);
  }

  async clear(): Promise<void> {
    // `removeItem` rather than a batch API: it is the one removal method every
    // version of AsyncStorage has had, which keeps the adapter portable.
    await Promise.all(
      Object.values(STORE_KEYS).map((key) => this.#backend.removeItem(key)),
    );
  }
}
