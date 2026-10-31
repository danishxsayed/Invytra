import type { PrismaClient } from "@prisma/client";

/*
 * What the free plan (a new workspace's trial) allows. Kept in step with TRIAL in
 * @invytra/shared (this package doesn't depend on it).
 */

/** Plans that are the free trial. */
export const FREE_PLANS = ["trial", "free"] as const;
/** People a free workspace can collect from LinkedIn / Sales Navigator searches, in total. */
export const FREE_PLAN_PROFILES = 100;

export const isFreePlan = (plan: string | null | undefined) => (FREE_PLANS as readonly string[]).includes(plan ?? "trial");

/** People this workspace has collected from searches so far. */
export async function profilesCollected(prisma: PrismaClient, workspaceId: string): Promise<number> {
  const r = await prisma.leadImport.aggregate({ where: { workspaceId }, _sum: { added: true } });
  return r._sum.added ?? 0;
}

/** How many more people this workspace may collect from searches; null = no limit (paid plan). */
export async function profilesLeft(prisma: PrismaClient, workspaceId: string): Promise<number | null> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } });
  if (!isFreePlan(ws?.plan)) return null;
  return Math.max(0, FREE_PLAN_PROFILES - (await profilesCollected(prisma, workspaceId)));
}
