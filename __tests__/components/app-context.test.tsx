import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { buildSeedJobs } from "@/domain/seed";
import { SimulatedRemote } from "@/remote/simulated-remote";
import { MemoryStore } from "@/store/memory-store";
import { AppProvider, useApp } from "@/state/app-context";

/**
 * Provider wiring.
 *
 * The engine itself is covered exhaustively in the domain tests; what is
 * checked here is the seam between it and React — that a screen's call to
 * `mutate` lands locally, shows up in the queue, and is reflected in the
 * state the screens render from.
 */

function harness(conditions?: { offline?: boolean }) {
  const store = new MemoryStore();
  const remote = new SimulatedRemote(buildSeedJobs(), { latencyMs: 0 });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProvider overrides={{ store, remote, conditions }}>{children}</AppProvider>
  );
  return { store, remote, wrapper };
}

describe("AppProvider", () => {
  it("loads the day's work on launch", async () => {
    const { wrapper } = harness();
    const { result } = await renderHook(() => useApp(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.jobs).toHaveLength(14);
    expect(result.current.sync.pending).toBe(0);
  });

  it("applies a mutation locally and reflects it in state", async () => {
    const { wrapper } = harness();
    const { result } = await renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.mutate("job_004", "set_status", { status: "en_route" });
    });

    await waitFor(() =>
      expect(result.current.jobs.find((job) => job.id === "job_004")?.status).toBe(
        "en_route",
      ),
    );
  });

  it("queues work while offline and keeps the local copy usable", async () => {
    // The device loads its work first, then loses signal — which is how a
    // technician's day actually goes. A first launch with no signal has
    // nothing to show, and that is covered by the engine tests.
    const { wrapper, store } = harness();
    const { result } = await renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      result.current.setConditions({ offline: true });
    });

    await act(async () => {
      await result.current.mutate("job_004", "set_status", { status: "en_route" });
    });

    await waitFor(() => expect(result.current.sync.pending).toBe(1));
    expect(result.current.sync.phase).toBe("offline");
    expect(result.current.jobs.find((job) => job.id === "job_004")?.status).toBe("en_route");
    expect(await store.readOutbox()).toHaveLength(1);
  });

  it("reports a rejected mutation without queuing it", async () => {
    const { wrapper } = harness();
    const { result } = await renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.mutate>> | undefined;
    await act(async () => {
      outcome = await result.current.mutate("job_004", "set_status", {
        status: "completed",
      });
    });

    expect(outcome?.ok).toBe(false);
    expect(result.current.sync.pending).toBe(0);
  });

  it("sends the backlog when the connection comes back", async () => {
    const { wrapper, remote } = harness();
    const { result } = await renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      result.current.setConditions({ offline: true });
    });

    await act(async () => {
      await result.current.mutate("job_004", "set_status", { status: "en_route" });
    });
    await waitFor(() => expect(result.current.sync.pending).toBe(1));

    await act(async () => {
      result.current.setConditions({ offline: false });
    });
    await act(async () => {
      await result.current.syncNow();
    });

    await waitFor(() => expect(result.current.sync.pending).toBe(0));
    expect(remote.snapshot().find((job) => job.id === "job_004")?.status).toBe("en_route");
  });

  it("surfaces a conflict when the office changed the same field", async () => {
    const { wrapper, remote } = harness();
    const { result } = await renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      result.current.setConditions({ offline: true });
    });

    await act(async () => {
      await result.current.mutate("job_005", "set_priority", { priority: "low" });
    });

    remote.applyRemoteEdit("job_005", { priority: "emergency" });

    await act(async () => {
      result.current.setConditions({ offline: false });
    });
    await act(async () => {
      await result.current.syncNow();
    });

    await waitFor(() => expect(result.current.conflicts).toHaveLength(1));
    expect(result.current.conflicts[0]).toMatchObject({
      jobId: "job_005",
      field: "priority",
    });

    await act(async () => {
      await result.current.resolveConflict(result.current.conflicts[0]!.id, "keep_mine");
    });

    await waitFor(() => expect(result.current.conflicts).toHaveLength(0));
    expect(remote.snapshot().find((job) => job.id === "job_005")?.priority).toBe("low");
  });

  it("resets the demo back to the seeded day", async () => {
    const { wrapper } = harness();
    const { result } = await renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.mutate("job_004", "set_status", { status: "en_route" });
    });
    await act(async () => {
      await result.current.resetDemo();
    });

    await waitFor(() => expect(result.current.jobs).toHaveLength(14));
    expect(result.current.jobs.find((job) => job.id === "job_004")?.status).toBe("scheduled");
    expect(result.current.sync.pending).toBe(0);
  });
});
