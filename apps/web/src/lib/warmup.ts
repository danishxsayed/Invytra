import type { PrismaClient } from "@invytra/db";
import { EMAIL_WARMUP, emailWarmupDay, emailWarmupTarget, inboxRate, localDayStart, type WarmupSettings } from "@invytra/shared";
import type { Result } from "./accounts";

/*
 * Email warm-up settings and progress per mailbox (the sending happens in the worker).
 * Scoped to the signed-in workspace; the pool size counts mailboxes platform-wide but
 * never reveals whose they are.
 */

export async function saveWarmupSettings(prisma: PrismaClient, workspaceId: string, id: string, s: WarmupSettings, now = new Date()): Promise<Result> {
  const m = await prisma.emailAccount.findFirst({ where: { id, workspaceId }, select: { warmupEnabled: true } });
  if (!m) return { ok: false, error: "Mailbox not found." };
  await prisma.emailAccount.update({
    where: { id },
    data: {
      warmupEnabled: s.enabled,
      warmupMaxDaily: s.maxDaily,
      warmupReplyRate: s.replyRate,
      // Turning it on (again) starts the ramp from day 1.
      ...(s.enabled && !m.warmupEnabled && { warmupStartedAt: now, lastWarmupAt: null }),
    },
  });
  return { ok: true, value: undefined };
}

export type WarmupStage = "OFF" | "NOT_ACTIVE" | "NO_PARTNER" | "WARMING" | "READY";

export async function warmupOverview(prisma: PrismaClient, workspaceId: string, now = new Date()) {
  const boxes = await prisma.emailAccount.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, fromName: true, status: true, timeZone: true, startHour: true, endHour: true, warmupEnabled: true, warmupStartedAt: true, warmupMaxDaily: true, warmupReplyRate: true },
  });
  const pool = await prisma.emailAccount.count({ where: { warmupEnabled: true, status: "ACTIVE" } });
  const since = new Date(now.getTime() - 7 * 86_400_000);

  return Promise.all(
    boxes.map(async (b) => {
      const [sentToday, landed, received, replies, lastFail] = await Promise.all([
        prisma.emailSend.count({ where: { emailAccountId: b.id, kind: "WARMUP", status: "SENT", createdAt: { gte: localDayStart(now, b.timeZone) } } }),
        prisma.emailSend.groupBy({ by: ["landedIn"], where: { emailAccountId: b.id, kind: "WARMUP", status: "SENT", landedIn: { not: null }, createdAt: { gte: since } }, _count: true }),
        prisma.emailSend.count({ where: { toAccountId: b.id, kind: "WARMUP", status: "SENT", createdAt: { gte: since } } }),
        prisma.emailSend.count({ where: { toAccountId: b.id, kind: "WARMUP", status: "SENT", isReply: true, createdAt: { gte: since } } }),
        prisma.emailSend.findFirst({ where: { emailAccountId: b.id, kind: "WARMUP", status: "FAILED", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { error: true, createdAt: true } }),
      ]);
      const n = (k: string) => landed.find((l) => l.landedIn === k)?._count ?? 0;
      const last7 = { inbox: n("INBOX"), spam: n("SPAM"), missing: n("MISSING") };
      const rate = inboxRate(last7);
      const day = b.warmupEnabled && b.warmupStartedAt ? emailWarmupDay(b.warmupStartedAt, now, b.timeZone) : null;
      const target = b.warmupEnabled && b.warmupStartedAt ? emailWarmupTarget(b.warmupStartedAt, b.warmupMaxDaily, now, b.timeZone) : 0;
      const othersInPool = pool - (b.warmupEnabled && b.status === "ACTIVE" ? 1 : 0);
      const stage: WarmupStage = !b.warmupEnabled
        ? "OFF"
        : b.status !== "ACTIVE"
          ? "NOT_ACTIVE"
          : othersInPool < 1
            ? "NO_PARTNER"
            : day! >= EMAIL_WARMUP.readyAfterDays && rate !== null && rate >= EMAIL_WARMUP.healthyInboxRate
              ? "READY"
              : "WARMING";
      return { ...b, day, target, sentToday, last7, rate, received, replies, lastFail, stage };
    }),
  );
}
export type WarmupRow = Awaited<ReturnType<typeof warmupOverview>>[number];
