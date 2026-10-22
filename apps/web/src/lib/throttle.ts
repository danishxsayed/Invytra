/**
 * Simple in-memory login throttle: 5 failed attempts per email per 15 minutes.
 * (Per process — fine for one server; move to Redis when running several.)
 */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list;
}

export function isThrottled(key: string, now = Date.now()): boolean {
  return recent(key, now).length >= MAX_FAILURES;
}

export function recordFailure(key: string, now = Date.now()): void {
  recent(key, now).push(now);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
