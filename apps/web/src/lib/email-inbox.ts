import { openSecret, sendEmail, type MailSender, type PrismaClient } from "@invytra/db";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * The Email Outreach inbox: conversations with leads who wrote back (replies, auto-replies,
 * bounces), the whole thread, and replying from the lead's own mailbox in the same thread.
 * Scoped to the signed-in workspace (CLAUDE.md rule 0).
 */

export const INBOX_VIEWS = ["needs", "all", "auto", "bounces"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];
const KIND: Record<InboxView, "REPLY" | "AUTO_REPLY" | "BOUNCE"> = { needs: "REPLY", all: "REPLY", auto: "AUTO_REPLY", bounces: "BOUNCE" };

export interface ConversationRow {
  leadId: string;
  email: string;
  name: string;
  company: string | null;
  campaign: string;
  mailbox: string | null;
  lastAt: Date;
  preview: string;
  fromThem: boolean;
  unread: number;
  needsReply: boolean;
}

/** Whether the lead's latest message still waits for an answer (not answered, not marked done). */
function needsReplyOf(lastIn: Date | null, lastOut: Date | null, doneAt: Date | null): boolean {
  if (!lastIn) return false;
  return (!lastOut || lastOut < lastIn) && (!doneAt || doneAt < lastIn);
}

export async function listConversations(prisma: PrismaClient, workspaceId: string, view: InboxView): Promise<ConversationRow[]> {
  const kind = KIND[view];
  const leads = await prisma.emailLead.findMany({
    where: { workspaceId, replies: { some: { kind } } },
    include: {
      campaign: { select: { name: true } },
      emailAccount: { select: { email: true } },
      replies: { where: { kind }, orderBy: { receivedAt: "desc" }, take: 1 },
      sends: { where: { kind: "REPLY", status: "SENT" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, text: true } },
      _count: { select: { replies: { where: { kind, readAt: null } } } },
    },
    orderBy: { repliedAt: { sort: "desc", nulls: "last" } },
    take: 300,
  });
  const rows = leads.map((l): ConversationRow => {
    const lastIn = l.replies[0]!;
    const lastOut = l.sends[0];
    const fromThem = !lastOut || lastOut.createdAt < lastIn.receivedAt;
    return {
      leadId: l.id,
      email: l.email,
      name: [l.firstName, l.lastName].filter(Boolean).join(" ") || lastIn.fromName || l.email,
      company: l.company,
      campaign: l.campaign.name,
      mailbox: l.emailAccount?.email ?? null,
      lastAt: fromThem ? lastIn.receivedAt : lastOut!.createdAt,
      preview: (fromThem ? lastIn.text : `You: ${lastOut!.text ?? ""}`).replace(/\s+/g, " ").slice(0, 140),
      fromThem,
      unread: l._count.replies,
      needsReply: kind === "REPLY" && needsReplyOf(lastIn.receivedAt, lastOut?.createdAt ?? null, l.inboxDoneAt),
    };
  });
  return rows.filter((r) => view !== "needs" || r.needsReply).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export async function inboxCounts(prisma: PrismaClient, workspaceId: string) {
  const [needs, unread] = await Promise.all([listConversations(prisma, workspaceId, "needs").then((r) => r.length), prisma.emailReply.count({ where: { workspaceId, kind: "REPLY", readAt: null } })]);
  return { needs, unread };
}

export interface ThreadItem {
  id: string;
  out: boolean;
  kind: "CAMPAIGN" | "REPLY" | "AUTO_REPLY" | "BOUNCE" | "SENT_REPLY";
  at: Date;
  subject: string;
  text: string;
  from: string;
  step: number | null;
}

/** One lead's whole thread, oldest first. Opening it marks their messages read. */
export async function getConversation(prisma: PrismaClient, workspaceId: string, leadId: string, now = new Date()) {
  const lead = await prisma.emailLead.findFirst({
    where: { id: leadId, workspaceId },
    include: {
      campaign: { select: { id: true, name: true } },
      emailAccount: { select: { id: true, email: true, fromName: true, status: true } },
      replies: { orderBy: { receivedAt: "asc" } },
      sends: { where: { kind: { in: ["CAMPAIGN", "REPLY"] }, status: "SENT" }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!lead) return null;
  const items: ThreadItem[] = [
    ...lead.sends.map((s): ThreadItem => ({ id: s.id, out: true, kind: s.kind === "REPLY" ? "SENT_REPLY" : "CAMPAIGN", at: s.createdAt, subject: s.subject, text: s.text ?? "", from: lead.emailAccount?.email ?? "", step: s.stepIndex })),
    ...lead.replies.map((r): ThreadItem => ({ id: r.id, out: false, kind: r.kind as ThreadItem["kind"], at: r.receivedAt, subject: r.subject, text: r.text, from: r.fromName ? `${r.fromName} <${r.fromEmail}>` : r.fromEmail, step: null })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  await prisma.emailReply.updateMany({ where: { emailLeadId: lead.id, readAt: null }, data: { readAt: now } });
  const lastIn = [...lead.replies].reverse().find((r) => r.kind === "REPLY") ?? null;
  const lastOut = [...lead.sends].reverse().find((s) => s.kind === "REPLY") ?? null;
  return {
    lead: { id: lead.id, email: lead.email, name: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || null, company: lead.company, title: lead.title, status: lead.status },
    campaign: lead.campaign,
    mailbox: lead.emailAccount,
    items,
    needsReply: needsReplyOf(lastIn?.receivedAt ?? null, lastOut?.createdAt ?? null, lead.inboxDoneAt),
    done: !!lead.inboxDoneAt && (!lastIn || lead.inboxDoneAt >= lastIn.receivedAt),
  };
}
export type Conversation = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

export const emailReplySchema = z.object({ text: z.string().trim().min(1, "Write your reply.").max(10_000) });

const key = () => {
  const k = process.env.SESSION_ENCRYPTION_KEY;
  if (!k) throw new Error("SESSION_ENCRYPTION_KEY is missing from .env");
  return k;
};
const reSubject = (s: string) => `Re: ${s.replace(/^\s*((re|aw|sv|fwd?):\s*)+/i, "")}`;

/** Answers the lead from their mailbox, threaded under their latest message. Sent right away, any hour. */
export async function sendEmailReply(prisma: PrismaClient, workspaceId: string, leadId: string, text: string, deps: { sender?: MailSender; now?: Date } = {}): Promise<Result> {
  const now = deps.now ?? new Date();
  const lead = await prisma.emailLead.findFirst({ where: { id: leadId, workspaceId }, include: { emailAccount: true, replies: { where: { kind: "REPLY" }, orderBy: { receivedAt: "desc" }, take: 1 } } });
  if (!lead) return { ok: false, error: "Conversation not found." };
  const box = lead.emailAccount;
  if (!box) return { ok: false, error: "The mailbox that wrote to this lead was removed, so the reply can't go out in the same thread." };
  const last = lead.replies[0];
  const subject = reSubject(last?.subject || lead.threadSubject || "");
  const r = await sendEmail(
    { ...box, provider: box.provider, password: openSecret(box.secret, key()) },
    { fromName: box.fromName, from: box.email, to: last?.fromEmail || lead.email, subject, text, signature: box.signature, inReplyTo: last?.messageId ?? lead.threadMessageId ?? undefined },
    deps.sender,
  );
  if (!r.ok) return { ok: false, error: r.error };
  await prisma.emailSend.create({
    data: { workspaceId, emailAccountId: box.id, emailLeadId: lead.id, kind: "REPLY", status: "SENT", toEmail: last?.fromEmail || lead.email, subject, messageId: r.messageId, text: text.trim() + (box.signature.trim() ? `\n\n${box.signature.trim()}` : ""), createdAt: now },
  });
  await prisma.emailAccount.update({ where: { id: box.id }, data: { lastSentAt: now } });
  return { ok: true, value: undefined };
}

export async function setConversationDone(prisma: PrismaClient, workspaceId: string, leadId: string, done: boolean, now = new Date()): Promise<Result> {
  const r = await prisma.emailLead.updateMany({ where: { id: leadId, workspaceId }, data: { inboxDoneAt: done ? now : null } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "Conversation not found." };
}

/** Asks the worker to read the workspace's mailboxes on its next minute (while the inbox is open). */
export async function requestEmailCheck(prisma: PrismaClient, workspaceId: string): Promise<void> {
  await prisma.emailAccount.updateMany({ where: { workspaceId, status: { not: "ERROR" } }, data: { lastReplyCheckAt: null } });
}
