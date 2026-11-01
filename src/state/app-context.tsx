import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { buildSeedJobs } from "@/domain/seed";
import type {
  Conflict,
  Job,
  Mutation,
  MutationKind,
  SyncState,
} from "@/domain/types";
import { SimulatedRemote } from "@/remote/simulated-remote";
import { NetworkError } from "@/remote/types";
import { createStore } from "@/store/create-store";
import type { LocalStore } from "@/store/port";
import { SyncEngine } from "@/sync/engine";

/**
 * Application state.
 *
 * One context, deliberately: the app has a single coherent piece of state
 * (the device's copy of the work) and every screen is a view onto it. A
 * store library would add indirection without removing anything.
 *
 * The important property is that **every screen reads from the local store,
 * never from the network**. The engine is the only thing that talks to the
 * server, and it writes its results into the store; the UI re-reads. That is
 * what makes the app behave identically whether there is signal or not.
 */

export interface FieldConditions {
  offline: boolean;
  latencyMs: number;
  failureRate: number;
}

export interface AppState {
  ready: boolean;
  persistent: boolean;
  jobs: Job[];
  outbox: Mutation[];
  conflicts: Conflict[];
  sync: SyncState;
  conditions: FieldConditions;
  busy: boolean;
}

export interface AppActions {
  mutate(
    jobId: string,
    kind: MutationKind,
    payload: Record<string, unknown>,
  ): Promise<{ ok: true; job: Job } | { ok: false; reason: string }>;
  syncNow(): Promise<void>;
  resolveConflict(conflictId: string, resolution: "keep_mine" | "keep_theirs"): Promise<void>;
  discardMutation(mutationId: string): Promise<void>;
  setConditions(next: Partial<FieldConditions>): void;
  /** Office-edits-a-job button, so the conflict path is demonstrable. */
  simulateOfficeEdit(jobId: string): Promise<void>;
  resetDemo(): Promise<void>;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

const INITIAL_SYNC: SyncState = {
  phase: "idle",
  pending: 0,
  deadLettered: 0,
  conflicts: 0,
  lastSyncedAt: null,
  lastError: null,
};

const DEFAULT_CONDITIONS: FieldConditions = {
  offline: false,
  latencyMs: 250,
  failureRate: 0,
};

export interface AppProviderProps {
  children: ReactNode;
  /**
   * Test and Storybook seam.
   *
   * In the app these are built from the platform adapters; a test passes an
   * in-memory store and a pre-configured remote so the whole provider — not a
   * reimplementation of it — is what gets exercised.
   */
  overrides?: {
    store?: LocalStore;
    remote?: SimulatedRemote;
    conditions?: Partial<FieldConditions>;
  };
}

export function AppProvider({ children, overrides }: AppProviderProps) {
  const initialConditions = useMemo(
    () => ({ ...DEFAULT_CONDITIONS, ...overrides?.conditions }),
    [overrides?.conditions],
  );

  const [state, setState] = useState<AppState>({
    ready: false,
    persistent: false,
    jobs: [],
    outbox: [],
    conflicts: [],
    sync: INITIAL_SYNC,
    conditions: { ...DEFAULT_CONDITIONS, ...overrides?.conditions },
    busy: false,
  });

  const storeRef = useRef<LocalStore | null>(null);
  const remoteRef = useRef<SimulatedRemote | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const conditionsRef = useRef<FieldConditions>(initialConditions);

  /** Re-reads everything the screens render from the local store. */
  const refresh = useCallback(async (patch: Partial<AppState> = {}) => {
    const store = storeRef.current;
    const engine = engineRef.current;
    if (!store || !engine) return;

    const [jobs, outbox, conflicts, sync] = await Promise.all([
      store.readJobs(),
      store.readOutbox(),
      store.readConflicts(),
      engine.state(!conditionsRef.current.offline),
    ]);

    setState((current) => ({ ...current, jobs, outbox, conflicts, sync, ...patch }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const resolved = overrides?.store
        ? { store: overrides.store, persistent: true }
        : await createStore();
      const { store, persistent } = resolved;
      if (cancelled) return;

      const remote =
        overrides?.remote ??
        new SimulatedRemote(buildSeedJobs(), { latencyMs: initialConditions.latencyMs });
      remote.configure(conditionsRef.current);
      const engine = new SyncEngine(store, remote);

      storeRef.current = store;
      remoteRef.current = remote;
      engineRef.current = engine;

      // First launch pulls the day's work; a later launch already has it, so
      // the screens render from disk and the pull is just a refresh.
      try {
        await engine.pull();
      } catch {
        // Offline on launch is a normal state, not an error to report.
      }

      if (cancelled) return;
      await refresh({ ready: true, persistent });
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh, overrides?.store, overrides?.remote, initialConditions]);

  const mutate = useCallback<AppActions["mutate"]>(
    async (jobId, kind, payload) => {
      const engine = engineRef.current;
      if (!engine) return { ok: false, reason: "The app is still starting up." };

      const result = await engine.enqueue(jobId, kind, payload);
      await refresh();

      // Opportunistic push. A failure here is not the caller's problem — the
      // work is already saved locally and queued.
      if (result.ok && !conditionsRef.current.offline) {
        void engine
          .drain()
          .then(() => refresh())
          .catch(() => undefined);
      }

      return result;
    },
    [refresh],
  );

  const syncNow = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    setState((current) => ({ ...current, busy: true }));
    try {
      await engine.pull();
      await engine.drain();
    } catch (error) {
      if (!(error instanceof NetworkError)) {
        console.warn("[fieldkit] sync failed", error);
      }
    } finally {
      await refresh({ busy: false });
    }
  }, [refresh]);

  const resolveConflict = useCallback<AppActions["resolveConflict"]>(
    async (conflictId, resolution) => {
      const engine = engineRef.current;
      if (!engine) return;
      await engine.resolve(conflictId, resolution);
      if (!conditionsRef.current.offline) await engine.drain().catch(() => undefined);
      await refresh();
    },
    [refresh],
  );

  const discardMutation = useCallback<AppActions["discardMutation"]>(
    async (mutationId) => {
      await engineRef.current?.discard(mutationId);
      await refresh();
    },
    [refresh],
  );

  const setConditions = useCallback<AppActions["setConditions"]>((next) => {
    const merged = { ...conditionsRef.current, ...next };
    conditionsRef.current = merged;
    remoteRef.current?.configure(merged);
    setState((current) => ({
      ...current,
      conditions: merged,
      sync: { ...current.sync, phase: merged.offline ? "offline" : "idle" },
    }));
  }, []);

  const simulateOfficeEdit = useCallback<AppActions["simulateOfficeEdit"]>(
    async (jobId) => {
      const remote = remoteRef.current;
      if (!remote) return;
      const current = remote.snapshot().find((job) => job.id === jobId);
      if (!current) return;
      remote.applyRemoteEdit(jobId, {
        priority: current.priority === "emergency" ? "low" : "emergency",
      });
      await refresh();
    },
    [refresh],
  );

  const resetDemo = useCallback<AppActions["resetDemo"]>(async () => {
    const store = storeRef.current;
    if (!store) return;
    setState((current) => ({ ...current, busy: true }));
    await store.clear();
    const remote = new SimulatedRemote(buildSeedJobs(), conditionsRef.current);
    const engine = new SyncEngine(store, remote);
    remoteRef.current = remote;
    engineRef.current = engine;
    try {
      await engine.pull();
    } catch {
      // Offline reset: the device simply starts empty until signal returns.
    }
    await refresh({ busy: false });
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      mutate,
      syncNow,
      resolveConflict,
      discardMutation,
      setConditions,
      simulateOfficeEdit,
      resetDemo,
    }),
    [
      state,
      mutate,
      syncNow,
      resolveConflict,
      discardMutation,
      setConditions,
      simulateOfficeEdit,
      resetDemo,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState & AppActions {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp() must be used inside <AppProvider>");
  return context;
}

export function useJob(jobId: string | undefined): Job | undefined {
  const { jobs } = useApp();
  return useMemo(() => jobs.find((job) => job.id === jobId), [jobs, jobId]);
}
