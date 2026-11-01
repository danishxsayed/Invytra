import { openSecret, realMailboxReader, type IncomingMail, type MailboxReader, type PrismaClient } from "@invytra/db";

/*
 * Replies and bounces for email campaigns: every few minutes, each mailbox that has written
 * to leads reads the new messages in its inbox. A reply from a lead stops their follow-ups
 * (in every campaign of the workspace); an out-of-office reply doesn't; a bounce marks the
 * lead bounced. Everything is kept for the inbox.
 */

export interface ReplyTickDeps {
  prisma: PrismaClient;
  key: string;
  reader?: MailboxReader;
  now?: Date;
  /** How often one mailbox is read. */
  everyMinutes?: number;
}

export interface ReplyTickResult {
  mailboxes: number;
  replies: number;
  autoReplies: number;
  bounces: number;
}

const DAY_MS = 86_400_000;
/** Mailboxes that wrote to a lead in this many days are read. */
const ACTIVE_DAYS = 60;

export async function emailReplyTick(d: ReplyTickDeps): Promise<ReplyTickResult> {
  const { prisma } = d;
  const now = d.now ?? new Date();
  const res: ReplyTickResult = { mailboxes: 0, replies: 0, autoReplies: 0, bounces: 0 };
  const every = (d.everyMinutes ?? 3) * 60_000;

  const boxes = await prisma.emailAccount.findMany({
    where: {
      status: { not: "ERROR" },
      leads: { some: { lastSentAt: { gte: new Date(now.getTime() - ACTIVE_DAYS * DAY_MS) } } },
      OR: [{ lastReplyCheckAt: null }, { lastReplyCheckAt: { lte: new Date(now.getTime() - every) } }],
    },
  });

  for (const box of boxes) {
    const firstSend = await prisma.emailLead.findFirst({ where: { emailAccountId: box.id, lastSentAt: { not: null } }, orderBy: { lastSentAt: "asc" }, select: { lastSentAt: true } });
    const since = new Date(Math.max((firstSend?.lastSentAt ?? now).getTime() - DAY_MS, now.getTime() - 14 * DAY_MS));
    let read;
    try {
      read = await (d.reader ?? realMailboxReader).read({ ...box, password: openSecret(box.secret, d.key) }, { uidValidity: box.replyUidValidity, uidNext: box.replyUidNext }, since);
    } catch {
      await prisma.emailAccount.update({ where: { id: box.id }, data: { lastReplyCheckAt: now } });
      continue; // Can't read right now; try again later.
    }
    res.mailboxes++;
    for (const m of read.messages) await handle(prisma, box, m, res);
    await prisma.emailAccount.update({ where: { id: box.id }, data: { replyUidValidity: read.uidValidity, replyUidNext: read.uidNext, lastReplyCheckAt: now } });
  }
  return res;
}

async function handle(prisma: PrismaClient, box: { id: string; workspaceId: string }, m: IncomingMail, res: ReplyTickResult) {
  const save = (kind: IncomingMail["kind"], emailLeadId: string | null) =>
    prisma.emailReply
      .create({
        data: { workspaceId: box.workspaceId, emailAccountId: box.id, emailLeadId, kind, fromEmail: m.fromEmail, fromName: m.fromName, subject: m.subject.slice(0, 300), text: m.text, messageId: m.messageId, receivedAt: m.date },
      })
      .catch(() => undefined); // Already saved (same Message-ID).

  if (m.kind === "BOUNCE") {
    const leads = await prisma.emailLead.findMany({ where: { emailAccountId: box.id, email: { in: m.bounced }, status: { in: ["ACTIVE", "COMPLETED"] } } });
    for (const l of leads) {
      await prisma.emailLead.update({ where: { id: l.id }, data: { status: "BOUNCED", nextAt: null, reason: `Bounced: ${m.text.split("\n").find((x) => x.trim())?.slice(0, 200) ?? m.subject}` } });
      res.bounces++;
    }
    if (leads.length) await save("BOUNCE", leads[0]!.id);
    return;
  }

  // Which lead: by sender address, else by the email it answers (someone replying from another address).
  let lead = await prisma.emailLead.findFirst({ where: { emailAccountId: box.id, email: m.fromEmail }, orderBy: { lastSentAt: "desc" } });
  if (!lead) {
    const ids = [m.inReplyTo, ...m.references].filter((x): x is string => !!x);
    if (ids.length) {
      const s = await prisma.emailSend.findFirst({ where: { emailAccountId: box.id, kind: { in: ["CAMPAIGN", "REPLY"] }, messageId: { in: ids }, emailLeadId: { not: null } }, select: { emailLeadId: true } });
      if (s) lead = await prisma.emailLead.findUnique({ where: { id: s.emailLeadId! } });
    }
  }
  if (!lead) return;

  if (m.kind === "AUTO_REPLY") {
    await save("AUTO_REPLY", lead.id);
    res.autoReplies++;
    return;
  }
  await save("REPLY", lead.id);
  res.replies++;
  // Stop this lead's follow-ups here, and the same person in the workspace's other campaigns.
  await prisma.emailLead.updateMany({ where: { id: lead.id, status: { in: ["ACTIVE", "COMPLETED"] } }, data: { status: "REPLIED", nextAt: null, repliedAt: m.date } });
  await prisma.emailLead.updateMany({
    where: { workspaceId: lead.workspaceId, email: lead.email, id: { not: lead.id }, status: "ACTIVE" },
    data: { status: "REPLIED", nextAt: null, reason: "Replied to another campaign" },
  });
}
