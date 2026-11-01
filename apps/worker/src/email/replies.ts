import { explainMailError, hardBounce, openSecret, realMailboxReader, softBounce, unsubscribeLead, type IncomingMail, type MailboxReader, type PrismaClient } from "@invytra/db";

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
  /** Lead messages found in the spam folder (moved back to the inbox). */
  fromSpam: number;
}

const DAY_MS = 86_400_000;
/** Mailboxes that wrote to a lead in this many days are read. */
const ACTIVE_DAYS = 60;

export async function emailReplyTick(d: ReplyTickDeps): Promise<ReplyTickResult> {
  const { prisma } = d;
  const now = d.now ?? new Date();
  const res: ReplyTickResult = { mailboxes: 0, replies: 0, autoReplies: 0, bounces: 0, fromSpam: 0 };
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
    // What counts as a lead's message in the spam folder: from a lead's address, answering one
    // of our emails, or a bounce — and not already saved.
    const [leadEmails, sentIds, savedIds] = await Promise.all([
      prisma.emailLead.findMany({ where: { emailAccountId: box.id, lastSentAt: { not: null } }, select: { email: true } }).then((r) => new Set(r.map((x) => x.email))),
      prisma.emailSend
        .findMany({ where: { emailAccountId: box.id, kind: { in: ["CAMPAIGN", "REPLY"] }, messageId: { not: null }, createdAt: { gte: new Date(now.getTime() - ACTIVE_DAYS * DAY_MS) } }, select: { messageId: true } })
        .then((r) => new Set(r.map((x) => x.messageId!))),
      prisma.emailReply.findMany({ where: { emailAccountId: box.id, messageId: { not: null }, receivedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } }, select: { messageId: true } }).then((r) => new Set(r.map((x) => x.messageId!))),
    ]);
    const fromLead = (e: { messageId: string | null; fromEmail: string; inReplyTo: string | null }) =>
      !(e.messageId && savedIds.has(e.messageId)) && (leadEmails.has(e.fromEmail) || (!!e.inReplyTo && sentIds.has(e.inReplyTo)) || /^(mailer-daemon|postmaster)@/i.test(e.fromEmail));

    let read;
    try {
      read = await (d.reader ?? realMailboxReader).read({ ...box, password: openSecret(box.secret, d.key) }, { uidValidity: box.replyUidValidity, uidNext: box.replyUidNext }, since, fromLead);
    } catch (e) {
      // Can't read right now: say why on the mailbox, try again later.
      await prisma.emailAccount.update({ where: { id: box.id }, data: { lastReplyCheckAt: now, replyError: explainMailError(e, "IMAP", box.provider) } });
      continue;
    }
    res.mailboxes++;
    for (const m of read.messages) {
      if (m.messageId && savedIds.has(m.messageId)) continue; // Seen already (e.g. moved back from spam).
      await handle(prisma, box, m, res);
      if (m.messageId) savedIds.add(m.messageId);
      if (m.fromSpam) res.fromSpam++;
    }
    await prisma.emailAccount.update({ where: { id: box.id }, data: { replyUidValidity: read.uidValidity, replyUidNext: read.uidNext, lastReplyCheckAt: now, replyError: null } });
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
    if (m.bounceType === "DELAYED") return; // The sending server is still trying: nothing to do yet.
    const leads = await prisma.emailLead.findMany({
      where: { emailAccountId: box.id, email: { in: m.bounced }, status: { in: ["ACTIVE", "COMPLETED"] } },
      include: { campaign: { select: { softBounceRetries: true, softRetryHours: true } } },
    });
    for (const l of leads) {
      const reason = m.bounceReason ?? (m.text.split("\n").find((x) => x.trim())?.slice(0, 200) || m.subject);
      if (m.bounceType === "SOFT") {
        // Resend the email that bounced: the last one sent to them.
        const last = await prisma.emailSend.findFirst({ where: { emailLeadId: l.id, kind: "CAMPAIGN", status: "SENT" }, orderBy: { createdAt: "desc" }, select: { stepIndex: true } });
        await softBounce(prisma, l.id, last?.stepIndex ?? Math.max(0, l.stepIndex - 1), reason, { retries: l.campaign.softBounceRetries, retryHours: l.campaign.softRetryHours }, m.date);
      } else await hardBounce(prisma, l.id, reason, m.date);
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
  // "Unsubscribe" / "stop" / "remove me" as a reply: honoured like the link.
  if (/^\s*(unsubscribe|stop|remove me|please remove|remove|opt[ -]?out|take me off)\b/i.test(m.text)) {
    await unsubscribeLead(prisma, lead.id, "Asked by reply", m.date);
    return;
  }
  // Stop this lead's follow-ups here, and the same person in the workspace's other campaigns.
  await prisma.emailLead.updateMany({ where: { id: lead.id, status: { in: ["ACTIVE", "COMPLETED"] } }, data: { status: "REPLIED", nextAt: null, repliedAt: m.date } });
  await prisma.emailLead.updateMany({
    where: { workspaceId: lead.workspaceId, email: lead.email, id: { not: lead.id }, status: "ACTIVE" },
    data: { status: "REPLIED", nextAt: null, reason: "Replied to another campaign" },
  });
}
