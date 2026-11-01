import { mxLookup, verifierFromEnv, verifyEmail, type EmailVerifier, type PrismaClient } from "@invytra/db";

/*
 * Email verification in the background, every minute: contacts marked "pending" are checked
 * (free checks, then the verification service), a few at a time.
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
const ACCOUNT_PROBLEM = /credit|api key|apikey|unauthori[sz]ed|forbidden|limit|suspend|answered 40[13]/i;

export async function verifyTick(d: VerifyTickDeps): Promise<{ checked: number; waiting: number; error: string | null }> {
  const { prisma } = d;
  const now = d.now ?? new Date();
  const verifier = d.verifier === undefined ? verifierFromEnv() : d.verifier;
  const mx = d.mx ?? mxLookup();
  const pending = await prisma.emailContact.findMany({ where: { verification: "PENDING" }, orderBy: { updatedAt: "asc" }, take: d.batch ?? 100, select: { id: true, email: true } });
  let checked = 0;
  let stopped: string | null = null;
  const queue = [...pending];
  const worker = async () => {
    while (queue.length && !stopped) {
      const c = queue.shift()!;
      const r = await verifyEmail(c.email, { verifier, mx });
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
