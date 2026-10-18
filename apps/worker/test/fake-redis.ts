import type { LockRedis } from "../src/browser/account-lock.js";

/** In-memory stand-in for the two Redis commands AccountLock uses. */
export class FakeRedis implements LockRedis {
  store = new Map<string, { value: string; expiresAt: number }>();
  now = () => Date.now();

  async set(key: string, value: string, _px: "PX", ttlMs: number, _nx: "NX") {
    const existing = this.store.get(key);
    if (existing && existing.expiresAt > this.now()) return null;
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
    return "OK" as const;
  }

  async eval(_script: string, _n: number, key: string, token: string) {
    const existing = this.store.get(key);
    if (existing?.value === token) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}
