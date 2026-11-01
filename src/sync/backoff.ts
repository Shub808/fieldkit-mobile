/**
 * Retry scheduling.
 *
 * A field device bounces between no signal and one bar all day, so a failed
 * push is the normal case, not the exceptional one. Two properties matter:
 *
 *  - **Exponential growth**, so a server that is down is not hammered.
 *  - **Full jitter**, so a depot full of devices coming back onto wifi at
 *    08:00 does not retry in lockstep and recreate the outage. The randomness
 *    is injected rather than taken from `Math.random()` so the schedule is
 *    deterministic under test.
 */

export const BASE_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 6;

export type Random = () => number;

export function backoffDelayMs(attempt: number, random: Random = Math.random): number {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** Math.max(attempt - 1, 0), MAX_DELAY_MS);
  // Full jitter: a uniform sample from [0, exponential].
  return Math.round(random() * exponential);
}

export function hasRetriesLeft(attempt: number): boolean {
  return attempt < MAX_ATTEMPTS;
}
