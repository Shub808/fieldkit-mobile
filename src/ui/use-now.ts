import { useSyncExternalStore } from "react";

/**
 * The current time, as an external store.
 *
 * Two reasons this is not just `Date.now()` in a component:
 *
 *  - **Purity.** A component that reads the clock during render is not
 *    idempotent — two reads in one render can disagree, so "2h ago" and
 *    "3h ago" can appear for the same timestamp. Every component reading from
 *    this store sees the identical instant.
 *  - **It is live.** The ticker advances on an interval, so relative labels
 *    age on screen instead of freezing at whatever they were when the screen
 *    mounted. For a technician checking whether a job is overdue, that
 *    matters.
 *
 * The clock is an external system, which is exactly what
 * `useSyncExternalStore` is for.
 */

const TICK_MS = 30_000;

let current = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function start(): void {
  if (timer) return;
  timer = setInterval(() => {
    current = Date.now();
    for (const listener of listeners) listener();
  }, TICK_MS);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): number => current;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test helper: advances the shared clock without waiting for the interval. */
export function __setNowForTests(value: number): void {
  current = value;
  for (const listener of listeners) listener();
}
