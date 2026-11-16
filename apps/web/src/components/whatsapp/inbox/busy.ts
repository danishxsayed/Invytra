/**
 * One request at a time from the inbox. Next's router runs server actions and refreshes through
 * one queue; the 5-second poll landing on top of a send (plus a refresh) could break the page, so
 * the poll waits while anything else is in flight, and nothing overlaps the poll.
 */
let inflight = 0;

export const busy = () => inflight > 0;

export async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
  }
}
