import { buildSeedJobs } from "@/domain/seed";
import type { Conflict, Mutation } from "@/domain/types";
import { AsyncStorageStore, type KeyValueBackend } from "@/store/async-storage-store";
import { MemoryStore } from "@/store/memory-store";
import type { LocalStore } from "@/store/port";

/**
 * One contract suite, run against every adapter.
 *
 * This is the reason persistence is behind a port: the real serialising
 * adapter is exercised by exactly the same assertions as the in-memory one,
 * so "it works in tests but not on device" cannot come from the store.
 */

/** A fake AsyncStorage: only the three methods the port actually needs. */
class FakeBackend implements KeyValueBackend {
  readonly items = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.items.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.items.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.items.delete(key);
  }
}

const mutation = (id: string): Mutation => ({
  id,
  jobId: "job_001",
  kind: "set_status",
  payload: { status: "en_route" },
  createdAt: "2026-10-27T08:00:00.000Z",
  baseRev: 1,
  attempts: 0,
  nextAttemptAt: 0,
  lastError: null,
  deadLettered: false,
});

const conflict = (id: string): Conflict => ({
  id,
  jobId: "job_001",
  field: "status",
  mine: "en_route",
  theirs: "cancelled",
  base: "scheduled",
  detectedAt: "2026-10-27T08:00:00.000Z",
});

const ADAPTERS: [string, () => LocalStore][] = [
  ["MemoryStore", () => new MemoryStore()],
  ["AsyncStorageStore", () => new AsyncStorageStore(new FakeBackend())],
];

describe.each(ADAPTERS)("%s — LocalStore contract", (_name, create) => {
  let store: LocalStore;

  beforeEach(() => {
    store = create();
  });

  it("starts empty rather than undefined", async () => {
    expect(await store.readJobs()).toEqual([]);
    expect(await store.readBaseline()).toEqual({});
    expect(await store.readOutbox()).toEqual([]);
    expect(await store.readConflicts()).toEqual([]);
    expect(await store.readMeta("anything")).toBeNull();
  });

  it("round-trips jobs", async () => {
    const jobs = buildSeedJobs();
    await store.writeJobs(jobs);
    expect(await store.readJobs()).toEqual(jobs);
  });

  it("round-trips the baseline, the outbox and conflicts", async () => {
    const baseline = { job_001: buildSeedJobs()[0]! };
    await store.writeBaseline(baseline);
    await store.writeOutbox([mutation("m1"), mutation("m2")]);
    await store.writeConflicts([conflict("c1")]);

    expect(await store.readBaseline()).toEqual(baseline);
    expect((await store.readOutbox()).map((entry) => entry.id)).toEqual(["m1", "m2"]);
    expect(await store.readConflicts()).toEqual([conflict("c1")]);
  });

  it("round-trips scalar metadata independently", async () => {
    await store.writeMeta("lastSyncedAt", "2026-10-27T08:00:00.000Z");
    await store.writeMeta("schemaVersion", 2);
    expect(await store.readMeta("lastSyncedAt")).toBe("2026-10-27T08:00:00.000Z");
    expect(await store.readMeta("schemaVersion")).toBe(2);
  });

  it("does not hand back a live reference", async () => {
    // A store that returns its own array lets a caller mutate 'persisted'
    // state without writing — which works in memory and breaks the moment
    // the adapter actually serialises.
    const jobs = buildSeedJobs();
    await store.writeJobs(jobs);
    const first = await store.readJobs();
    first[0]!.title = "Mutated outside the store";
    expect((await store.readJobs())[0]!.title).not.toBe("Mutated outside the store");
  });

  it("is not affected by later mutation of the array it was given", async () => {
    const jobs = buildSeedJobs();
    await store.writeJobs(jobs);
    jobs.length = 0;
    expect(await store.readJobs()).toHaveLength(14);
  });

  it("clears everything", async () => {
    await store.writeJobs(buildSeedJobs());
    await store.writeOutbox([mutation("m1")]);
    await store.writeConflicts([conflict("c1")]);
    await store.writeMeta("lastSyncedAt", "x");

    await store.clear();

    expect(await store.readJobs()).toEqual([]);
    expect(await store.readOutbox()).toEqual([]);
    expect(await store.readConflicts()).toEqual([]);
    expect(await store.readMeta("lastSyncedAt")).toBeNull();
  });
});

describe("AsyncStorageStore — resilience to bad stored data", () => {
  it("falls back to empty rather than throwing on corrupt JSON", async () => {
    const backend = new FakeBackend();
    backend.items.set("fieldkit.jobs", "{ this is not json");
    const store = new AsyncStorageStore(backend);
    // An app that throws on launch has, as far as the technician is
    // concerned, lost everything.
    await expect(store.readJobs()).resolves.toEqual([]);
  });

  it("falls back when the stored value is the wrong shape", async () => {
    const backend = new FakeBackend();
    backend.items.set("fieldkit.jobs", JSON.stringify({ not: "an array" }));
    backend.items.set("fieldkit.baseline", JSON.stringify(["not an object"]));
    const store = new AsyncStorageStore(backend);
    expect(await store.readJobs()).toEqual([]);
    expect(await store.readBaseline()).toEqual({});
  });

  it("falls back on a stored null", async () => {
    const backend = new FakeBackend();
    backend.items.set("fieldkit.outbox", "null");
    expect(await new AsyncStorageStore(backend).readOutbox()).toEqual([]);
  });

  it("writes JSON the next launch can read", async () => {
    const backend = new FakeBackend();
    await new AsyncStorageStore(backend).writeOutbox([mutation("m1")]);
    // A fresh adapter over the same backend is what a cold start looks like.
    const reopened = new AsyncStorageStore(backend);
    expect((await reopened.readOutbox())[0]!.id).toBe("m1");
  });
});
