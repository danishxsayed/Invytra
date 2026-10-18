import { randomUUID } from "node:crypto";

/** The two Redis commands the lock needs (ioredis satisfies this). */
export interface LockRedis {
  set(key: string, value: string, px: "PX", ttlMs: number, nx: "NX"): Promise<"OK" | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * One running session per LinkedIn account (CLAUDE.md rule 2). Two browsers on
 * the same account at once is a strong automation signal.
 */
export class AccountLock {
  constructor(
    private readonly redis: LockRedis,
    private readonly ttlMs = 15 * 60_000,
  ) {}

  private key(accountId: string): string {
    return `invytra:lock:account:${accountId}`;
  }

  /** Returns a token if acquired, or null if another worker holds the account. */
  async acquire(accountId: string): Promise<string | null> {
    const token = randomUUID();
    const ok = await this.redis.set(this.key(accountId), token, "PX", this.ttlMs, "NX");
    return ok === "OK" ? token : null;
  }

  /** Releases only if we still own the lock (it may have expired and been retaken). */
  async release(accountId: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, this.key(accountId), token);
  }
}
