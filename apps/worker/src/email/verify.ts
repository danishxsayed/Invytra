import {
  freeChecks,
  fromServiceAnswer,
  mxLookup,
  refundVerifyCredit,
  spendVerifyCredit,
  verifierFromEnv,
  verifyCreditsLeft,
  type EmailVerifier,
  type PrismaClient,
  type VerifyOutcome,
} from "@invytra/db";
import { monthlyVerifyCredits } from "@invytra/shared";

/*
 * Email verification in the background, every minute: contacts marked "pending" are checked
 * (free checks, then the verification service), a few at a time. Each deep check uses one of
 * the workspace's verification credits; the free checks cost nothing. A workspace with no
 * credits left waits (its contacts stay pending) without holding up the others.
 */

export interface VerifyTickDeps {
  prisma: PrismaClient;
  verifier?: EmailVerifier | null;
  mx?: (domain: string) => Promise<string[] | null>;
  now?: Date;
  batch?: number;
  concurrency?: number;
}

/** Errors about our account with the service (not about the address): stop for this round. */
const ACCOUNT_PROBLEM = /credit|api key|apikey|unauthori[sz]ed|forbidden|limit|suspend|answered 40[123]/i;
export const NO_CREDITS = "no verification credits left (buy more, or wait for next month's credits)";

export async function verifyTick(d: VerifyTickDeps): Promise<{ checked: number; waiting: number; error: string | null }> {
  const { prisma } = d;
  const now = d.now ?? new Date();
  const verifier = d.verifier === undefined ? verifierFromEnv() : d.verifier;
  const mx = d.mx ?? mxLookup();

  // Workspaces out of credits wait, so their contacts don't fill every batch.
  const blocked: string[] = [];
  if (verifier) {
    const waitingWs = await prisma.emailContact.groupBy({ by: ["workspaceId"], where: { verification: "PENDING" } });
    for (const { workspaceId } of waitingWs) {
      if ((await verifyCreditsLeft(prisma, workspaceId, monthlyVerifyCredits, now)) > 0) continue;
      blocked.push(workspaceId);
      await prisma.emailContact.updateMany({ where: { workspaceId, verification: "PENDING", NOT: { verifyDetail: `Waiting: ${NO_CREDITS}` } }, data: { verifyDetail: `Waiting: ${NO_CREDITS}` } });
    }
  }

  const pending = await prisma.emailContact.findMany({
    where: { verification: "PENDING", ...(blocked.length && { workspaceId: { notIn: blocked } }) },
    orderBy: { updatedAt: "asc" },
    take: d.batch ?? 100,
    select: { id: true, email: true, workspaceId: true },
  });
  let checked = 0;
  let stopped: string | null = null;
  const outOfCredits = new Set<string>();
  const queue = [...pending];

  const check = async (c: (typeof pending)[number]): Promise<VerifyOutcome | "no-credit"> => {
    const free = await freeChecks(c.email, mx);
    if (free) return free;
    if (!verifier) return { status: "UNKNOWN", detail: "Passed the free checks; no verification service is set up for the mailbox check" };
    const credit = await spendVerifyCredit(prisma, c.workspaceId, monthlyVerifyCredits, now);
    if (!credit) return "no-credit";
    let r: VerifyOutcome;
    try {
      r = fromServiceAnswer(await verifier.check(c.email), verifier.name);
    } catch (e) {
      r = { retry: true, error: `${verifier.name}: ${e instanceof Error ? e.message : "no answer"}` };
    }
    if ("retry" in r) await refundVerifyCredit(prisma, c.workspaceId, credit);
    return r;
  };

  const worker = async () => {
    while (queue.length && !stopped) {
      const c = queue.shift()!;
      if (outOfCredits.has(c.workspaceId)) continue;
      const r = await check(c);
      if (r === "no-credit") {
        outOfCredits.add(c.workspaceId);
        await prisma.emailContact.updateMany({ where: { workspaceId: c.workspaceId, verification: "PENDING" }, data: { verifyDetail: `Waiting: ${NO_CREDITS}` } });
        continue;
      }
      if ("retry" in r) {
        await prisma.emailContact.update({ where: { id: c.id }, data: { verifyDetail: `Waiting: ${r.error}` } });
        if (ACCOUNT_PROBLEM.test(r.error)) stopped = r.error;
        continue;
      }
      await prisma.emailContact.update({ where: { id: c.id }, data: { verification: r.status, verifyDetail: r.detail, verifiedAt: now } });
      checked++;
    }
  };
  await Promise.all(Array.from({ length: d.concurrency ?? 8 }, worker));
  return { checked, waiting: pending.length - checked, error: stopped };
}
