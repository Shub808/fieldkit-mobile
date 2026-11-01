import { buildSeedJobs } from "@/domain/seed";
import type { Job } from "@/domain/types";
import { SimulatedRemote } from "@/remote/simulated-remote";
import { NetworkError, ServerError, type PushResult, type RemoteApi } from "@/remote/types";
import { MemoryStore } from "@/store/memory-store";
import { MAX_ATTEMPTS } from "@/sync/backoff";
import { META_LAST_SYNCED, SyncEngine } from "@/sync/engine";

/**
 * Sync engine tests.
 *
 * The engine takes its store, its remote, its clock and its randomness as
 * constructor arguments, so every scenario below — losing signal mid-drain,
 * a flapping server, the office editing a job behind the technician's back —
 * is an ordinary deterministic unit test. No device, no network, no timers.
 */

const NOW = Date.parse("2026-10-27T08:00:00.000Z");

function harness(options: { jobs?: Job[]; now?: () => number } = {}) {
  const jobs = options.jobs ?? buildSeedJobs(NOW);
  const store = new MemoryStore();
  const remote = new SimulatedRemote(jobs, { now: () => NOW });
  let counter = 0;
  const engine = new SyncEngine(store, remote, {
    now: options.now ?? (() => NOW),
    random: () => 0.5,
    newId: () => `gen_${(counter += 1)}`,
  });
  return { store, remote, engine, jobs };
}

/** Seeds the device from the server, as a first launch would. */
async function bootstrap(h: ReturnType<typeof harness>) {
  await h.engine.pull();
}

describe("local writes", () => {
  it("applies a mutation immediately and queues it", async () => {
    const h = harness();
    await bootstrap(h);

    const result = await h.engine.enqueue("job_004", "set_status", { status: "en_route" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.status).toBe("en_route");

    const jobs = await h.store.readJobs();
    expect(jobs.find((job) => job.id === "job_004")?.status).toBe("en_route");
    expect(await h.store.readOutbox()).toHaveLength(1);
  });

  it("does not invent a server revision for a local write", async () => {
    const h = harness();
    await bootstrap(h);
    const before = (await h.store.readJobs()).find((job) => job.id === "job_004")!.rev;

    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });

    const after = (await h.store.readJobs()).find((job) => job.id === "job_004")!.rev;
    // The revision is the server's to assign. Bumping it locally would make
    // the next push look up to date when it is not.
    expect(after).toBe(before);
  });

  it("rejects an illegal transition offline, where the technician can see it", async () => {
    const h = harness();
    await bootstrap(h);

    const result = await h.engine.enqueue("job_004", "set_status", { status: "completed" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/cannot move a scheduled job to completed/i);
    // Nothing was queued, so there is nothing to fail hours later.
    expect(await h.store.readOutbox()).toHaveLength(0);
  });

  it("refuses to complete a job with required work outstanding", async () => {
    const h = harness();
    await bootstrap(h);

    const result = await h.engine.enqueue("job_001", "complete_job", {
      completionNotes: "All finished, everything checked and signed off.",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/outstanding/i);
  });

  it("queues several mutations in order", async () => {
    const h = harness();
    await bootstrap(h);

    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });
    await h.engine.enqueue("job_004", "set_priority", { priority: "high" });
    await h.engine.enqueue("job_004", "set_status", { status: "on_site" });

    expect((await h.store.readOutbox()).map((entry) => entry.kind)).toEqual([
      "set_status",
      "set_priority",
      "set_status",
    ]);
  });

  it("refuses a job that is not on the device", async () => {
    const h = harness();
    await bootstrap(h);
    const result = await h.engine.enqueue("job_nope", "set_priority", { priority: "low" });
    expect(result).toEqual({ ok: false, reason: "That job is not on this device." });
  });
});

describe("draining the outbox", () => {
  it("pushes everything and empties the queue", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });
    await h.engine.enqueue("job_004", "set_priority", { priority: "high" });

    const report = await h.engine.drain();

    expect(report.pushed).toBe(2);
    expect(await h.store.readOutbox()).toHaveLength(0);
    expect(h.remote.snapshot().find((job) => job.id === "job_004")?.status).toBe("en_route");
  });

  it("advances the server revision and the device's baseline together", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });
    await h.engine.drain();

    const local = (await h.store.readJobs()).find((job) => job.id === "job_004")!;
    const baseline = (await h.store.readBaseline())["job_004"]!;
    expect(local.rev).toBe(2);
    expect(baseline.rev).toBe(2);
    expect(baseline.status).toBe("en_route");
  });

  it("records the last sync time", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.drain();
    expect(await h.store.readMeta(META_LAST_SYNCED)).toBe(new Date(NOW).toISOString());
  });
});

describe("losing signal", () => {
  it("keeps the queue intact and stops working through it", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });
    await h.engine.enqueue("job_005", "set_priority", { priority: "low" });

    h.remote.configure({ offline: true });
    const report = await h.engine.drain();

    expect(report.stoppedBecauseOffline).toBe(true);
    expect(report.pushed).toBe(0);
    // Nothing is marked as failed: there was nothing wrong with the work.
    const outbox = await h.store.readOutbox();
    expect(outbox).toHaveLength(2);
    expect(outbox.every((entry) => entry.attempts === 0)).toBe(true);
    expect(outbox.every((entry) => !entry.deadLettered)).toBe(true);
  });

  it("delivers the backlog in order once signal returns", async () => {
    const h = harness();
    await bootstrap(h);
    h.remote.configure({ offline: true });

    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });
    await h.engine.enqueue("job_004", "set_status", { status: "on_site" });
    await h.engine.drain();
    expect(await h.store.readOutbox()).toHaveLength(2);

    h.remote.configure({ offline: false });
    const report = await h.engine.drain();

    expect(report.pushed).toBe(2);
    expect(h.remote.snapshot().find((job) => job.id === "job_004")?.status).toBe("on_site");
  });

  it("keeps local work usable while offline", async () => {
    const h = harness();
    await bootstrap(h);
    h.remote.configure({ offline: true });

    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });
    await h.engine.enqueue("job_004", "toggle_checklist", { itemId: "chk_4_1", done: true });
    await h.engine.drain();

    const local = (await h.store.readJobs()).find((job) => job.id === "job_004")!;
    expect(local.status).toBe("en_route");
    expect(local.checklist.find((item) => item.id === "chk_4_1")?.done).toBe(true);
  });
});

describe("a flapping server", () => {
  function failingRemote(failures: number, inner: RemoteApi): RemoteApi {
    let remaining = failures;
    return {
      pull: (since) => inner.pull(since),
      push: async (mutation) => {
        if (remaining > 0) {
          remaining -= 1;
          throw new ServerError(503, "The service is temporarily unavailable.");
        }
        return inner.push(mutation);
      },
    };
  }

  it("retries with a backoff instead of giving up or spinning", async () => {
    const jobs = buildSeedJobs(NOW);
    const store = new MemoryStore();
    const inner = new SimulatedRemote(jobs, { now: () => NOW });
    let counter = 0;
    let clock = NOW;
    const engine = new SyncEngine(store, failingRemote(1, inner), {
      now: () => clock,
      random: () => 1,
      newId: () => `gen_${(counter += 1)}`,
    });

    await engine.pull();
    await engine.enqueue("job_004", "set_status", { status: "en_route" });

    const first = await engine.drain();
    expect(first.retried).toBe(1);
    const queued = (await store.readOutbox())[0]!;
    expect(queued.attempts).toBe(1);
    expect(queued.lastError).toMatch(/temporarily unavailable/);
    expect(queued.nextAttemptAt).toBeGreaterThan(clock);

    // A drain before the backoff elapses must leave it alone.
    const tooSoon = await engine.drain();
    expect(tooSoon.pushed).toBe(0);
    expect((await store.readOutbox())[0]!.attempts).toBe(1);

    clock = queued.nextAttemptAt + 1;
    const second = await engine.drain();
    expect(second.pushed).toBe(1);
    expect(await store.readOutbox()).toHaveLength(0);
  });

  it("dead-letters a mutation that has exhausted its retries", async () => {
    const jobs = buildSeedJobs(NOW);
    const store = new MemoryStore();
    const inner = new SimulatedRemote(jobs, { now: () => NOW });
    let counter = 0;
    let clock = NOW;
    const engine = new SyncEngine(store, failingRemote(MAX_ATTEMPTS + 2, inner), {
      now: () => clock,
      random: () => 1,
      newId: () => `gen_${(counter += 1)}`,
    });

    await engine.pull();
    await engine.enqueue("job_004", "set_status", { status: "en_route" });

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await engine.drain();
      const entry = (await store.readOutbox())[0]!;
      clock = entry.nextAttemptAt + 1;
    }

    const entry = (await store.readOutbox())[0]!;
    expect(entry.deadLettered).toBe(true);
    expect(entry.attempts).toBe(MAX_ATTEMPTS);

    // A dead-lettered mutation is held for the user, not retried forever.
    const after = await engine.drain();
    expect(after.pushed).toBe(0);

    await engine.discard(entry.id);
    expect(await store.readOutbox()).toHaveLength(0);
  });

  it("does not retry a mutation the server will never accept", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });

    // The office cancels the job before the device's change gets through.
    h.remote.applyRemoteEdit("job_004", { status: "cancelled" });

    // First drain: revision conflict → rebase.
    await h.engine.drain();
    // Second drain: the transition is now illegal, so it is rejected outright.
    const report = await h.engine.drain();

    const outbox = await h.store.readOutbox();
    expect(report.deadLettered + (await h.store.readConflicts()).length).toBeGreaterThan(0);
    expect(outbox.filter((entry) => !entry.deadLettered)).toHaveLength(0);
  });
});

describe("idempotency", () => {
  it("applies a mutation once even if the response was lost and it is retried", async () => {
    const jobs = buildSeedJobs(NOW);
    const store = new MemoryStore();
    const inner = new SimulatedRemote(jobs, { now: () => NOW });

    let dropNext = true;
    const lossy: RemoteApi = {
      pull: (since) => inner.pull(since),
      push: async (mutation) => {
        const result = await inner.push(mutation);
        if (dropNext) {
          dropNext = false;
          // The server applied it; the response never reached the device.
          throw new ServerError(503, "Connection reset");
        }
        return result;
      },
    };

    let counter = 0;
    let clock = NOW;
    const engine = new SyncEngine(store, lossy, {
      now: () => clock,
      random: () => 1,
      newId: () => `gen_${(counter += 1)}`,
    });

    await engine.pull();
    await engine.enqueue("job_004", "add_note", {
      note: {
        id: "note_x",
        body: "Parts ordered, returning tomorrow.",
        authorName: "Morgan Hale",
        createdAt: new Date(NOW).toISOString(),
      },
    });

    await engine.drain();
    clock = (await store.readOutbox())[0]!.nextAttemptAt + 1;
    await engine.drain();

    const serverJob = inner.snapshot().find((job) => job.id === "job_004")!;
    expect(serverJob.notes).toHaveLength(1);
    expect(await store.readOutbox()).toHaveLength(0);
  });
});

describe("conflicts", () => {
  it("merges automatically when the two sides touched different fields", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });

    // The office raises the priority while the device is out of signal.
    h.remote.applyRemoteEdit("job_004", { priority: "emergency" });

    // One drain is enough: the conflict rebases cleanly and is immediately
    // re-attempted against the new revision.
    const report = await h.engine.drain();

    expect(report.pushed).toBe(1);
    expect(report.conflicts).toBe(0);
    expect(await h.store.readConflicts()).toHaveLength(0);
    expect(await h.store.readOutbox()).toHaveLength(0);

    const server = h.remote.snapshot().find((job) => job.id === "job_004")!;
    expect(server.status).toBe("en_route");
    expect(server.priority).toBe("emergency");
  });

  it("holds a genuine disagreement for a human instead of guessing", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_005", "set_priority", { priority: "low" });

    h.remote.applyRemoteEdit("job_005", { priority: "emergency" });

    const report = await h.engine.drain();

    expect(report.conflicts).toBe(1);
    const conflicts = await h.store.readConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      jobId: "job_005",
      field: "priority",
      mine: "low",
      theirs: "emergency",
    });
    // The mutation is dropped — its intent is captured in the conflict.
    expect(await h.store.readOutbox()).toHaveLength(0);
  });

  it("re-queues the device's value when the technician keeps theirs", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_005", "set_priority", { priority: "low" });
    h.remote.applyRemoteEdit("job_005", { priority: "emergency" });
    await h.engine.drain();

    const conflict = (await h.store.readConflicts())[0]!;
    const resolved = await h.engine.resolve(conflict.id, "keep_mine");

    expect(resolved?.priority).toBe("low");
    expect(await h.store.readConflicts()).toHaveLength(0);
    expect(await h.store.readOutbox()).toHaveLength(1);

    await h.engine.drain();
    expect(h.remote.snapshot().find((job) => job.id === "job_005")?.priority).toBe("low");
  });

  it("queues nothing when the technician accepts the server's value", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_005", "set_priority", { priority: "low" });
    h.remote.applyRemoteEdit("job_005", { priority: "emergency" });
    await h.engine.drain();

    const conflict = (await h.store.readConflicts())[0]!;
    const resolved = await h.engine.resolve(conflict.id, "keep_theirs");

    expect(resolved?.priority).toBe("emergency");
    expect(await h.store.readOutbox()).toHaveLength(0);
  });

  it("does not report the same conflict again on every pull", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_005", "set_priority", { priority: "low" });
    h.remote.applyRemoteEdit("job_005", { priority: "emergency" });

    await h.engine.pull();
    await h.engine.pull();
    await h.engine.pull();

    expect(await h.store.readConflicts()).toHaveLength(1);
  });
});

describe("pull", () => {
  it("brings down jobs the device has never seen", async () => {
    const h = harness();
    const report = await h.engine.pull();
    expect(report.received).toBe(14);
    expect(await h.store.readJobs()).toHaveLength(14);
    expect(Object.keys(await h.store.readBaseline())).toHaveLength(14);
  });

  it("applies office changes the device has not touched", async () => {
    const h = harness();
    await bootstrap(h);
    h.remote.applyRemoteEdit("job_004", { title: "Rescheduled: smart meter install" });

    await h.engine.pull();

    expect((await h.store.readJobs()).find((job) => job.id === "job_004")?.title).toBe(
      "Rescheduled: smart meter install",
    );
  });

  it("does not discard unsynced local work", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });

    h.remote.applyRemoteEdit("job_004", { title: "Rescheduled" });
    await h.engine.pull();

    const local = (await h.store.readJobs()).find((job) => job.id === "job_004")!;
    expect(local.status).toBe("en_route");
    expect(local.title).toBe("Rescheduled");
    expect(await h.store.readOutbox()).toHaveLength(1);
  });

  it("propagates a network error rather than pretending it synced", async () => {
    const h = harness();
    h.remote.configure({ offline: true });
    await expect(h.engine.pull()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("state reporting", () => {
  it("summarises what the technician needs to know", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });

    const online = await h.engine.state(true);
    expect(online).toMatchObject({ phase: "idle", pending: 1, conflicts: 0 });

    const offline = await h.engine.state(false);
    expect(offline.phase).toBe("offline");
    expect(offline.pending).toBe(1);
  });

  it("counts dead-lettered work separately from pending work", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });
    const outbox = await h.store.readOutbox();
    await h.store.writeOutbox([{ ...outbox[0]!, deadLettered: true, lastError: "nope" }]);

    const state = await h.engine.state(true);
    expect(state.pending).toBe(0);
    expect(state.deadLettered).toBe(1);
  });
});

describe("concurrent drains", () => {
  it("does not push the same mutation twice", async () => {
    const h = harness();
    await bootstrap(h);
    await h.engine.enqueue("job_004", "set_status", { status: "en_route" });

    const [a, b] = await Promise.all([h.engine.drain(), h.engine.drain()]);

    // Both callers get the same report; the queue was drained once.
    expect(a).toEqual(b);
    expect(a.pushed).toBe(1);
    expect(await h.store.readOutbox()).toHaveLength(0);
  });
});

describe("the simulated remote itself", () => {
  it("fails deterministically at the configured rate", async () => {
    const remote = new SimulatedRemote(buildSeedJobs(NOW), {
      failureRate: 1,
      random: () => 0,
      now: () => NOW,
    });
    await expect(remote.pull(null)).rejects.toBeInstanceOf(ServerError);
  });

  it("throws a network error when offline", async () => {
    const remote = new SimulatedRemote(buildSeedJobs(NOW), { offline: true });
    await expect(remote.pull(null)).rejects.toBeInstanceOf(NetworkError);
  });

  it("enforces the same transition rules as the device", async () => {
    const remote = new SimulatedRemote(buildSeedJobs(NOW), { now: () => NOW });
    const result: PushResult = await remote.push({
      id: "m1",
      jobId: "job_004",
      kind: "set_status",
      payload: { status: "completed" },
      createdAt: new Date(NOW).toISOString(),
      baseRev: 1,
      attempts: 1,
      nextAttemptAt: 0,
      lastError: null,
      deadLettered: false,
    });
    expect(result.status).toBe("rejected");
  });

  it("returns only jobs changed since the given instant", async () => {
    const remote = new SimulatedRemote(buildSeedJobs(NOW), { now: () => NOW });
    remote.applyRemoteEdit("job_004", { priority: "emergency" });
    const changed = await remote.pull(new Date(NOW).toISOString());
    expect(changed.map((job) => job.id)).toEqual(["job_004"]);
  });
});
