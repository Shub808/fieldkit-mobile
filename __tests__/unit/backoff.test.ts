import {
  BASE_DELAY_MS,
  MAX_ATTEMPTS,
  MAX_DELAY_MS,
  backoffDelayMs,
  hasRetriesLeft,
} from "@/sync/backoff";

describe("backoffDelayMs", () => {
  // Randomness is injected, so the schedule is assertable rather than
  // "probably roughly right".
  const noJitter = () => 1;
  const fullJitter = () => 0;

  it("doubles with each attempt", () => {
    expect(backoffDelayMs(1, noJitter)).toBe(BASE_DELAY_MS);
    expect(backoffDelayMs(2, noJitter)).toBe(BASE_DELAY_MS * 2);
    expect(backoffDelayMs(3, noJitter)).toBe(BASE_DELAY_MS * 4);
    expect(backoffDelayMs(4, noJitter)).toBe(BASE_DELAY_MS * 8);
  });

  it("caps the delay so a device never waits absurdly long", () => {
    expect(backoffDelayMs(20, noJitter)).toBe(MAX_DELAY_MS);
  });

  it("applies full jitter — a sample from [0, exponential]", () => {
    // Without jitter, a depot of devices coming back onto wifi at 08:00
    // retries in lockstep and recreates the outage it is recovering from.
    expect(backoffDelayMs(3, fullJitter)).toBe(0);
    expect(backoffDelayMs(3, () => 0.5)).toBe((BASE_DELAY_MS * 4) / 2);
  });

  it("never returns a negative delay", () => {
    for (let attempt = 0; attempt <= 10; attempt += 1) {
      expect(backoffDelayMs(attempt, () => 0)).toBeGreaterThanOrEqual(0);
    }
  });

  it("treats attempt 0 like the first attempt", () => {
    expect(backoffDelayMs(0, noJitter)).toBe(BASE_DELAY_MS);
  });
});

describe("hasRetriesLeft", () => {
  it("stops after the configured maximum", () => {
    expect(hasRetriesLeft(MAX_ATTEMPTS - 1)).toBe(true);
    expect(hasRetriesLeft(MAX_ATTEMPTS)).toBe(false);
    expect(hasRetriesLeft(MAX_ATTEMPTS + 1)).toBe(false);
  });
});
