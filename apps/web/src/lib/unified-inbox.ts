import type { PrismaClient } from "@invytra/db";
import { canUseChannel, channelById, livePhoto } from "@invytra/shared";
import { listConversations as emailConversations } from "./email-inbox";
import { conversationList, MEETING_TAG } from "./inbox";

/*
 * The workspace inbox: LinkedIn conversations and email replies in one list (later WhatsApp),
 * newest first. Each channel's own rules decide what "needs a reply" means; replying and
 * marking done go through that channel's inbox code.
 */

export const UNIFIED_FILTERS = ["all", "needs", "done"] as const;
export type UnifiedFilter = (typeof UNIFIED_FILTERS)[number];
export const UNIFIED_CHANNELS = ["all", "linkedin", "email"] as const;
export type UnifiedChannel = (typeof UNIFIED_CHANNELS)[number];

export interface UnifiedRow {
  /** "li:<conversation id>" or "em:<email lead id>" */
  key: string;
  channel: "linkedin" | "email";
  name: string;
  company: string | null;
  /** The LinkedIn account or mailbox it's on. */
  via: string | null;
  campaign: string | null;
  preview: string;
  lastAt: Date;
  fromThem: boolean;
  unread: boolean;
  needsReply: boolean;
  meeting: boolean;
  /** Their LinkedIn photo (still valid), when known. */
  photo: string | null;
}

const LIMIT = 200;

/** Which channels this workspace can use in the inbox. */
export function inboxChannels(channels: string[]) {
  return (["linkedin", "email"] as const).filter((c) => canUseChannel(channelById(c)!, channels));
}

export async function unifiedList(prisma: PrismaClient, workspaceId: string, channels: string[], opts: { filter?: UnifiedFilter; channel?: UnifiedChannel; q?: string } = {}): Promise<UnifiedRow[]> {
  const filter = opts.filter ?? "needs";
  const usable = inboxChannels(channels);
  const want = (c: "linkedin" | "email") => usable.includes(c) && (!opts.channel || opts.channel === "all" || opts.channel === c);
  const q = (opts.q ?? "").trim().toLowerCase().slice(0, 100);
  const [li, em] = await Promise.all([
    want("linkedin") ? conversationList(prisma, workspaceId, { filter: filter === "needs" ? "needs_reply" : filter === "done" ? "done" : "all", q, pageSize: LIMIT }) : null,
    want("email") ? emailConversations(prisma, workspaceId, filter === "needs" ? "needs" : "all") : null,
  ]);
  const rows: UnifiedRow[] = [];
  for (const c of li?.rows ?? []) {
    const l = c.campaignLead;
    rows.push({
      key: `li:${c.id}`,
      channel: "linkedin",
      name: c.participantName,
      company: l?.company ?? null,
      via: c.account.label,
      campaign: l?.campaign?.name ?? null,
      preview: (c.lastFromMe ? `You: ${c.lastMessageText}` : c.lastMessageText).replace(/\s+/g, " ").slice(0, 140),
      lastAt: c.lastMessageAt,
      fromThem: !c.lastFromMe,
      unread: c.unread,
      needsReply: !c.lastFromMe && !c.doneAt,
      meeting: c.tags.some((t) => t.toLowerCase() === MEETING_TAG.toLowerCase()),
      photo: livePhoto(l?.lead?.photoUrl),
    });
  }
  const leadIds = (em ?? []).map((r) => r.leadId);
  const meetings = leadIds.length ? new Set((await prisma.emailLead.findMany({ where: { id: { in: leadIds }, meetingAt: { not: null } }, select: { id: true } })).map((r) => r.id)) : new Set<string>();
  for (const r of em ?? []) {
    if (filter === "done" && r.needsReply) continue;
    if (q && ![r.name, r.email, r.company ?? "", r.preview].some((v) => v.toLowerCase().includes(q))) continue;
    rows.push({ key: `em:${r.leadId}`, channel: "email", name: r.name, company: r.company, via: r.mailbox, campaign: r.campaign, preview: r.preview, lastAt: r.lastAt, fromThem: r.fromThem, unread: r.unread > 0, needsReply: r.needsReply, meeting: meetings.has(r.leadId), photo: null });
  }
  return rows.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime()).slice(0, LIMIT);
}

/** Conversations waiting for a reply, across channels (menu badge). */
export async function unifiedNeedsCount(prisma: PrismaClient, workspaceId: string, channels: string[]): Promise<number> {
  return (await unifiedList(prisma, workspaceId, channels, { filter: "needs" })).length;
}

/** "li:abc" → { channel, id }, or null. */
export function parseKey(key: string | undefined | null): { channel: "linkedin" | "email"; id: string } | null {
  const m = /^(li|em):([A-Za-z0-9_-]{1,40})$/.exec(key ?? "");
  return m ? { channel: m[1] === "li" ? "linkedin" : "email", id: m[2]! } : null;
}

/** Marks or unmarks a meeting booked with an email lead (counted on the overview). */
export async function setEmailMeeting(prisma: PrismaClient, workspaceId: string, leadId: string, on: boolean, now = new Date()) {
  const lead = await prisma.emailLead.findFirst({ where: { id: leadId, workspaceId }, select: { meetingAt: true } });
  if (!lead) return false;
  await prisma.emailLead.update({ where: { id: leadId }, data: { meetingAt: on ? (lead.meetingAt ?? now) : null } });
  return true;
}
