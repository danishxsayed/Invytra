import type { PrismaClient } from "@invytra/db";
import { dncMatcher, type DncKind } from "@invytra/shared";

/** The workspace's do-not-contact list as a matcher (loaded once per campaign per tick). */
export async function loadDnc(prisma: PrismaClient, workspaceId: string) {
  const rows = await prisma.doNotContact.findMany({ where: { workspaceId }, select: { kind: true, value: true } });
  return dncMatcher(rows.map((r) => ({ kind: r.kind as DncKind, value: r.value })));
}
