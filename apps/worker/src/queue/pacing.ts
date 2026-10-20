/**
 * Per-account timing state kept in Redis:
 * - nextActionAt: earliest time the next action may start (human-like gaps).
 *   While an action runs, it holds a provisional value so no other job claims the account.
 * - inviteBlockedUntil: set when LinkedIn reports the weekly invite limit.
 */
export interface PacingStore {
  get(accountId: string, key: PacingKey): Promise<Date | null>;
  set(accountId: string, key: PacingKey, at: Date): Promise<void>;
  /**
   * Atomically claim the account's next slot: succeeds only if nextActionAt has
   * passed, and then holds it until `holdUntil`. Returns null on success, or the
   * time the current holder/gap ends.
   */
  claim(accountId: string, now: Date, holdUntil: Date): Promise<Date | null>;
}
export type PacingKey = "nextActionAt" | "inviteBlockedUntil";

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, px: "PX", ttl: number): Promise<unknown>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

const k = (accountId: string, key: PacingKey) => `invytra:pacing:${accountId}:${key}`;
const ttlFor = (at: Date) => Math.max(60_000, at.getTime() - Date.now() + 60_000);

const CLAIM_SCRIPT = `
local v = redis.call("get", KEYS[1])
if v and tonumber(v) > tonumber(ARGV[1]) then return v end
redis.call("set", KEYS[1], ARGV[2], "PX", ARGV[3])
return false`;

export function redisPacingStore(redis: RedisLike): PacingStore {
  return {
    async get(accountId, key) {
      const v = await redis.get(k(accountId, key));
      return v ? new Date(Number(v)) : null;
    },
    async set(accountId, key, at) {
      await redis.set(k(accountId, key), String(at.getTime()), "PX", ttlFor(at));
    },
    async claim(accountId, now, holdUntil) {
      const r = await redis.eval(
        CLAIM_SCRIPT,
        1,
        k(accountId, "nextActionAt"),
        String(now.getTime()),
        String(holdUntil.getTime()),
        String(ttlFor(holdUntil)),
      );
      return r ? new Date(Number(r)) : null;
    },
  };
}

export function memoryPacingStore(): PacingStore & { data: Map<string, Date> } {
  const data = new Map<string, Date>();
  return {
    data,
    async get(accountId, key) {
      return data.get(k(accountId, key)) ?? null;
    },
    async set(accountId, key, at) {
      data.set(k(accountId, key), at);
    },
    async claim(accountId, now, holdUntil) {
      const cur = data.get(k(accountId, "nextActionAt"));
      if (cur && cur > now) return cur;
      data.set(k(accountId, "nextActionAt"), holdUntil);
      return null;
    },
  };
}
