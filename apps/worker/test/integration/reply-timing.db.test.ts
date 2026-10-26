/** Replies skip the after-action gap but wait for a running action (only with TEST_DATABASE_URL). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountLock } from "../../src/browser/account-lock.js";
import type { SessionManagerDeps } from "../../src/browser/session-manager.js";
import { memoryPacingStore } from "../../src/queue/pacing.js";
import { processAction } from "../../src/queue/processor.js";
import { FakeRedis } from "../fake-redis.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("reply timing", () => {
  let prisma: PrismaClient;
  const WS = "ws-rt";
  const now = new Date("2026-10-26T10:30:00Z");
  const redis = new FakeRedis();
  const lock = new AccountLock(redis);
  const session = {
    lock,
    accounts: { get: async () => ({ id: "acc-rt", label: "rt", proxyUrl: "", timezone: "UTC", status: "ACTIVE" }), markNeedsAttention: async () => undefined, touch: async () => undefined },
  } as unknown as SessionManagerDeps;
  const newReply = (id: string) =>
    prisma.action.create({ data: { id, accountId: "acc-rt", type: "REPLY", status: "QUEUED", payload: { name: "Jane Doe", text: "Hi" }, scheduledAt: now } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "RT" } });
    await prisma.linkedinAccount.create({ data: { id: "acc-rt", workspaceId: WS, label: "rt", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("waits only 15 s while another action is still running on the account", async () => {
    const pacing = memoryPacingStore();
    await pacing.set("acc-rt", "nextActionAt", new Date(now.getTime() + 14 * 60_000)); // a running action's hold
    await newReply("r1");
    const r = await processAction({ prisma, session, pacing, ignoreWorkingHours: false, now: () => now }, "r1");
    expect(r).toEqual({ kind: "reschedule", runAt: new Date(now.getTime() + 15_000), reason: "ACCOUNT_BUSY" });
  });

  it("skips the human-like gap after the last action (and retries in 15 s if the browser is busy)", async () => {
    const pacing = memoryPacingStore();
    await pacing.set("acc-rt", "nextActionAt", new Date(now.getTime() + 3 * 60_000)); // gap after the last action
    await lock.acquire("acc-rt"); // another session holds the browser right now
    await prisma.action.deleteMany({ where: { id: "r1" } });
    await newReply("r2");
    const r = await processAction({ prisma, session, pacing, ignoreWorkingHours: false, now: () => now }, "r2");
    expect(r).toMatchObject({ kind: "reschedule", reason: "ACCOUNT_BUSY" });
    expect((r as { runAt: Date }).runAt.getTime() - Date.now()).toBeLessThan(20_000);
  });
});
