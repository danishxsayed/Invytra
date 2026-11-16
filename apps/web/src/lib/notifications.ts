import type { PrismaClient } from "@invytra/db";

/* The bell, for the signed-in teammate in their workspace (WhatsApp for now). */

export const NOTIFICATION_TABS = ["all", "MENTION", "ASSIGNED", "CAMPAIGN", "TEMPLATE"] as const;
export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  actor: string | null;
  tone: string | null;
  read: boolean;
  at: string;
}

const mine = (workspaceId: string, userId: string, channel: string) => ({ workspaceId, userId, channel });

export async function listNotifications(prisma: PrismaClient, workspaceId: string, userId: string, tab: NotificationTab = "all", channel = "whatsapp") {
  const where = { ...mine(workspaceId, userId, channel), ...(tab !== "all" && { kind: tab }) };
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.notification.groupBy({ by: ["kind"], where: { ...mine(workspaceId, userId, channel), readAt: null }, _count: { _all: true } }),
  ]);
  const counts: Record<NotificationTab, number> = { all: 0, MENTION: 0, ASSIGNED: 0, CAMPAIGN: 0, TEMPLATE: 0 };
  for (const g of unread) {
    counts.all += g._count._all;
    if (g.kind in counts) counts[g.kind as NotificationTab] += g._count._all;
  }
  const items: NotificationRow[] = rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, actor: n.actorName, tone: n.tone, read: !!n.readAt, at: n.createdAt.toISOString() }));
  return { items, counts };
}

/** Marks one notification read, or all of them (ids omitted). */
export async function markNotificationsRead(prisma: PrismaClient, workspaceId: string, userId: string, ids?: string[], now = new Date(), channel = "whatsapp") {
  const r = await prisma.notification.updateMany({ where: { ...mine(workspaceId, userId, channel), readAt: null, ...(ids && { id: { in: ids.slice(0, 100) } }) }, data: { readAt: now } });
  return r.count;
}

/**
 * What every WhatsApp page checks every few seconds: chats with unread messages (the favicon and the
 * sidebar badge), when the last message came in (the sound), and unread notifications (the bell).
 */
export async function whatsappPulse(prisma: PrismaClient, workspaceId: string, userId: string) {
  const [chats, last, bell] = await Promise.all([
    prisma.whatsappContact.count({ where: { workspaceId, unread: { gt: 0 }, chatAt: { not: null } } }),
    prisma.whatsappContact.findFirst({ where: { workspaceId, chatFrom: "IN", chatAt: { not: null } }, orderBy: { chatAt: "desc" }, select: { chatAt: true } }),
    prisma.notification.count({ where: { ...mine(workspaceId, userId, "whatsapp"), readAt: null } }),
  ]);
  return { unreadChats: chats, lastIn: last?.chatAt?.toISOString() ?? null, bell };
}
