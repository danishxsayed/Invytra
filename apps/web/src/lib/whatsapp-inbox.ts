import type { Prisma, PrismaClient } from "@invytra/db";
import { prettyPhone } from "@invytra/shared";

/*
 * The WhatsApp inbox: chats (contacts who wrote, or whom a teammate messaged), their filters
 * and counts, and one chat with its messages and notes. Sending lives in whatsapp-inbox-send.ts.
 * Everything is scoped to the workspace (CLAUDE.md rule 0).
 */

export const WINDOW_MS = 24 * 3_600_000;
const DAY = 86_400_000;

export interface InboxQuery {
  tab?: "all" | "unread" | "priority";
  /** "" anyone, "me", "none" (unassigned) or a user id */
  assigned?: string;
  q?: string;
  campaigns?: string[];
  tags?: string[];
  /** open = inside the 24-hour window */
  window?: "open" | "closed";
  /** needs = their message is the last one */
  reply?: "needs" | "replied";
  read?: "read" | "unread";
  /** today, 7d, 30d */
  since?: "today" | "7d" | "30d";
  sort?: "new" | "old";
}

export function inboxWhere(workspaceId: string, me: string, o: InboxQuery, now = new Date()): Prisma.WhatsappContactWhereInput {
  const q = (o.q ?? "").trim().slice(0, 100);
  const digits = q.replace(/\D/g, "");
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const sinceAt = o.since === "today" ? new Date(new Date(now).setHours(0, 0, 0, 0)) : o.since === "7d" ? new Date(now.getTime() - 7 * DAY) : o.since === "30d" ? new Date(now.getTime() - 30 * DAY) : null;
  return {
    workspaceId,
    chatAt: { not: null },
    AND: [
      o.tab === "unread" || o.read === "unread" ? { unread: { gt: 0 } } : o.read === "read" ? { unread: 0 } : {},
      o.tab === "priority" ? { starred: true } : {},
      o.assigned === "me" ? { assignedTo: me } : o.assigned === "none" ? { assignedTo: null } : o.assigned ? { assignedTo: o.assigned } : {},
      o.campaigns?.length ? { messages: { some: { campaignId: { in: o.campaigns } } } } : {},
      o.tags?.length ? { tags: { hasSome: o.tags } } : {},
      o.window === "open" ? { lastInboundAt: { gte: windowStart } } : o.window === "closed" ? { OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: windowStart } }] } : {},
      o.reply === "needs" ? { chatFrom: "IN", chatDoneAt: null } : o.reply === "replied" ? { OR: [{ chatFrom: "OUT" }, { chatDoneAt: { not: null } }] } : {},
      sinceAt ? { chatAt: { gte: sinceAt } } : {},
      q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { profileName: { contains: q, mode: "insensitive" } },
              { chatPreview: { contains: q, mode: "insensitive" } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : {},
    ],
  };
}

export const contactName = (c: { firstName: string | null; lastName: string | null; profileName: string | null; phone: string }) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.profileName || prettyPhone(c.phone);

export async function listChats(prisma: PrismaClient, workspaceId: string, me: string, o: InboxQuery, now = new Date()) {
  const rows = await prisma.whatsappContact.findMany({
    where: inboxWhere(workspaceId, me, o, now),
    orderBy: { chatAt: o.sort === "old" ? "asc" : "desc" },
    take: 200,
    select: { id: true, phone: true, firstName: true, lastName: true, profileName: true, chatAt: true, chatPreview: true, chatFrom: true, unread: true, starred: true, assignedTo: true, chatDoneAt: true, lastInboundAt: true },
  });
  return rows.map((c) => ({
    id: c.id,
    name: contactName(c),
    at: c.chatAt!.toISOString(),
    preview: c.chatFrom === "OUT" ? `You: ${c.chatPreview ?? ""}` : (c.chatPreview ?? ""),
    unread: c.unread,
    starred: c.starred,
    assignedTo: c.assignedTo,
    done: !!c.chatDoneAt,
    open: !!c.lastInboundAt && now.getTime() - c.lastInboundAt.getTime() < WINDOW_MS,
  }));
}
export type ChatRow = Awaited<ReturnType<typeof listChats>>[number];

/** Numbers for the tabs and the filter popup. */
export async function inboxCounts(prisma: PrismaClient, workspaceId: string, me: string, o: InboxQuery, now = new Date()) {
  const base = { ...o, tab: undefined };
  const n = (x: InboxQuery) => prisma.whatsappContact.count({ where: inboxWhere(workspaceId, me, x, now) });
  const [all, unread, priority, open, closed, needs, replied, read, campaigns, tags] = await Promise.all([
    n(base),
    n({ ...base, tab: "unread" }),
    n({ ...base, tab: "priority" }),
    n({ ...base, window: "open" }),
    n({ ...base, window: "closed" }),
    n({ ...base, reply: "needs" }),
    n({ ...base, reply: "replied" }),
    n({ ...base, read: "read" }),
    prisma.$queryRaw<{ id: string; name: string; n: bigint }[]>`SELECT c.id, c.name, count(DISTINCT m.contact_id) AS n FROM whatsapp_campaigns c JOIN whatsapp_messages m ON m.campaign_id = c.id JOIN whatsapp_contacts k ON k.id = m.contact_id AND k.chat_at IS NOT NULL WHERE c.workspace_id = ${workspaceId} GROUP BY c.id, c.name ORDER BY max(c.created_at) DESC LIMIT 50`,
    prisma.$queryRaw<{ tag: string; n: bigint }[]>`SELECT unnest(tags) AS tag, count(*) AS n FROM whatsapp_contacts WHERE workspace_id = ${workspaceId} AND chat_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 100`,
  ]);
  return {
    all,
    unread,
    priority,
    window: { open, closed },
    reply: { needs, replied },
    read: { read, unread: all - read },
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, count: Number(c.n) })),
    tags: tags.map((t) => ({ tag: t.tag, count: Number(t.n) })),
  };
}

/** Teammates a chat can be assigned to. */
export async function inboxMembers(prisma: PrismaClient, workspaceId: string) {
  const m = await prisma.membership.findMany({ where: { workspaceId }, select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
  return m.map((x) => ({ id: x.user.id, name: x.user.name }));
}

export interface ChatMessage {
  id: string;
  dir: "IN" | "OUT";
  kind: string;
  body: string;
  at: string;
  status: string;
  error: string | null;
  media: { type: string | null; fileName: string | null } | null;
  replyTo: string | null;
  wamid: string | null;
  campaign: string | null;
  extra: { template?: string; header?: string | null; footer?: string | null; buttons?: string[] } | null;
  by: string | null;
}

/** One chat: the contact, its messages (oldest first), notes and the reply window. */
export async function getChat(prisma: PrismaClient, workspaceId: string, contactId: string, now = new Date()) {
  const c = await prisma.whatsappContact.findFirst({ where: { id: contactId, workspaceId } });
  if (!c) return null;
  const [msgs, notes] = await Promise.all([
    prisma.whatsappMessage.findMany({ where: { workspaceId, contactId: c.id, status: { notIn: ["QUEUED", "SKIPPED"] } }, orderBy: { createdAt: "desc" }, take: 300, include: { campaign: { select: { name: true } } } }),
    prisma.whatsappNote.findMany({ where: { workspaceId, contactId: c.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const windowEnds = c.lastInboundAt ? new Date(c.lastInboundAt.getTime() + WINDOW_MS) : null;
  return {
    contact: c,
    name: contactName(c),
    windowEnds: windowEnds && windowEnds > now ? windowEnds.toISOString() : null,
    messages: msgs.reverse().map(
      (m): ChatMessage => ({
        id: m.id,
        dir: m.direction === "IN" ? "IN" : "OUT",
        kind: m.kind,
        body: m.body,
        at: (m.sentAt ?? m.createdAt).toISOString(),
        status: m.status,
        error: m.error,
        media: m.mediaId ? { type: m.mediaType, fileName: m.fileName } : null,
        replyTo: m.replyTo,
        wamid: m.wamid,
        campaign: m.campaign?.name ?? null,
        extra: (m.extra as ChatMessage["extra"]) ?? null,
        by: m.byName,
      }),
    ),
    notes: notes.map((n) => ({ id: n.id, body: n.body, by: n.userName, userId: n.userId, at: n.createdAt.toISOString() })),
  };
}
export type Chat = NonNullable<Awaited<ReturnType<typeof getChat>>>;
