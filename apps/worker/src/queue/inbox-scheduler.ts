import type { PrismaClient } from "@invytra/db";
import type { Queue } from "bullmq";
import { enqueueAction, type ActionJob } from "./queue.js";

/**
 * Makes sure every ACTIVE account has its inbox read about every `everyMinutes`.
 * Only enqueues — the processor still applies working hours and pacing.
 * Returns how many syncs were enqueued.
 */
export async function scheduleInboxSyncs(
  prisma: PrismaClient,
  queue: Queue<ActionJob>,
  everyMinutes: number,
  now = new Date(),
): Promise<number> {
  const accounts = await prisma.linkedinAccount.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let added = 0;
  for (const { id } of accounts) {
    const pending = await prisma.action.count({
      where: { accountId: id, type: "INBOX_SYNC", status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (pending > 0) continue;
    const recent = await prisma.action.count({
      where: {
        accountId: id,
        type: "INBOX_SYNC",
        status: "SUCCEEDED",
        executedAt: { gte: new Date(now.getTime() - everyMinutes * 60_000) },
      },
    });
    if (recent > 0) continue;
    await enqueueAction(prisma, queue, { accountId: id, type: "INBOX_SYNC" });
    added++;
  }
  return added;
}
