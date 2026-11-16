import type { PrismaClient } from "@prisma/client";

/*
 * The bell (in-app notifications): one row per teammate. Made when someone is mentioned in a
 * note, a chat is assigned to them, a campaign's 3-hour report is ready, or Meta reviews a template.
 */

export type NotificationKind = "MENTION" | "ASSIGNED" | "CAMPAIGN" | "TEMPLATE";

export interface NewNotification {
  workspaceId: string;
  /** Who gets it; people who aren't members of the workspace are skipped. */
  userIds: readonly string[];
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  actorName?: string | null;
  tone?: "good" | "bad" | null;
  channel?: string;
}

export async function notify(prisma: PrismaClient, n: NewNotification): Promise<number> {
  const ids = [...new Set(n.userIds)];
  if (!ids.length) return 0;
  const members = await prisma.membership.findMany({ where: { workspaceId: n.workspaceId, userId: { in: ids } }, select: { userId: true } });
  if (!members.length) return 0;
  const r = await prisma.notification.createMany({
    data: members.map((m) => ({
      workspaceId: n.workspaceId,
      userId: m.userId,
      channel: n.channel ?? "whatsapp",
      kind: n.kind,
      title: n.title.slice(0, 300),
      body: n.body ? n.body.slice(0, 500) : null,
      href: n.href ?? null,
      actorName: n.actorName ?? null,
      tone: n.tone ?? null,
    })),
  });
  return r.count;
}

export async function workspaceOwnerIds(prisma: PrismaClient, workspaceId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({ where: { workspaceId, role: "OWNER" }, select: { userId: true } });
  return rows.map((r) => r.userId);
}
