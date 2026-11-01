import { emailBody, hardBounce, openSecret, publicOrigin, sendEmail, softBounce, unsubscribeToken, unsubscribeUrls, type MailSender, type PrismaClient } from "@invytra/db";
import {
  emailSequenceSchema,
  localDayStart,
  mailboxReadiness,
  nextSendAfter,
  pickMailbox,
  renderEmailText,
  type EmailStep,
  type MailboxSendState,
} from "@invytra/shared";

/*
 * Email campaign engine, run every minute by the worker. For each active campaign, leads
 * whose next email is due get it from their mailbox (the first email picks the campaign
 * mailbox with the most room today; every later email comes from that same mailbox and
 * threads under the first). Each mailbox's daily limit, sending hours and gap (plus a
 * random extra) are checked before every send.
 */

export interface CampaignTickDeps {
  prisma: PrismaClient;
  key: string;
  sender?: MailSender;
  now?: Date;
  rand?: () => number;
  /** Leads looked at per campaign per tick. */
  batch?: number;
  /** Where unsubscribe links point (default: PUBLIC_URL / WEB_ORIGIN). */
  origin?: string;
}

export interface CampaignTickResult {
  sent: number;
  bounced: number;
  skipped: number;
  failed: number;
  completed: number;
}

const FAILS_TO_STOP = 3;
const DAY_MS = 86_400_000;

type Box = MailboxSendState & {
  email: string;
  fromName: string;
  signature: string;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  username: string;
  secret: string;
};

export async function emailCampaignTick(d: CampaignTickDeps): Promise<CampaignTickResult> {
  const { prisma } = d;
  const now = d.now ?? new Date();
  const rand = d.rand ?? Math.random;
  const res: CampaignTickResult = { sent: 0, bounced: 0, skipped: 0, failed: 0, completed: 0 };

  const campaigns = await prisma.emailCampaign.findMany({ where: { status: "ACTIVE" }, include: { mailboxes: { include: { emailAccount: true } } }, orderBy: { launchedAt: "asc" } });
  // One state per mailbox across campaigns, so a mailbox in two campaigns still keeps one limit.
  const boxes = new Map<string, Box>();
  for (const c of campaigns)
    for (const { emailAccount: m } of c.mailboxes) {
      if (boxes.has(m.id)) continue;
      const sentToday = await prisma.emailSend.count({ where: { emailAccountId: m.id, status: "SENT", kind: { not: "WARMUP" }, createdAt: { gte: localDayStart(now, m.timeZone) } } });
      boxes.set(m.id, { ...m, days: m.sendDays, sentToday });
    }

  for (const c of campaigns) {
    const steps = emailSequenceSchema.safeParse(c.steps);
    if (!steps.success) continue;
    const mine = c.mailboxes.map((x) => boxes.get(x.emailAccountId)!);
    if (!mine.some((b) => mailboxReadiness(b, now).ok)) continue;

    const due = await prisma.emailLead.findMany({
      where: { campaignId: c.id, status: "ACTIVE", nextAt: { lte: now } },
      orderBy: { nextAt: "asc" },
      take: d.batch ?? 50,
      include: { contact: { select: { subscribed: true, bounceStatus: true } } },
    });
    if (!due.length) continue;
    const [fallbacks, suppressed] = await Promise.all([
      prisma.emailVariable.findMany({ where: { workspaceId: c.workspaceId, fallback: { not: "" } }, select: { key: true, fallback: true } }).then((v) => Object.fromEntries(v.map((x) => [x.key, x.fallback]))),
      prisma.emailSuppression.findMany({ where: { workspaceId: c.workspaceId }, select: { email: true } }).then((r) => new Set(r.map((x) => x.email))),
    ]);
    for (const lead of due) {
      // Never email someone who unsubscribed, hard-bounced or is on the suppression list (checked again at send time).
      const domain = lead.email.slice(lead.email.indexOf("@") + 1);
      const stop = lead.contact && !lead.contact.subscribed ? "Unsubscribed" : lead.contact?.bounceStatus === "HARD" ? "Bounced before (hard bounce)" : suppressed.has(lead.email) || suppressed.has(`@${domain}`) || suppressed.has(domain) ? "On the suppression list" : null;
      if (stop) {
        await prisma.emailLead.update({ where: { id: lead.id }, data: { status: "SKIPPED", nextAt: null, reason: stop } });
        res.skipped++;
        continue;
      }
      // Its own mailbox (if still in the campaign), else the one with the most room.
      const own = lead.emailAccountId ? mine.find((b) => b.id === lead.emailAccountId) : undefined;
      const box = own ?? pickMailbox(mine, now);
      if (!box || !mailboxReadiness(box, now).ok) continue;
      const step: EmailStep | undefined = steps.data[lead.stepIndex];
      if (!step) {
        await prisma.emailLead.update({ where: { id: lead.id }, data: { status: "COMPLETED", nextAt: null } });
        continue;
      }
      const vars = { ...lead, vars: { ...fallbacks, ...((lead.vars ?? {}) as Record<string, string>) } };
      const followUpInThread = !step.subject && !!lead.threadMessageId;
      const subjectTpl = step.subject || (lead.threadSubject ? `Re: ${lead.threadSubject}` : steps.data[0]!.subject);
      const subject = followUpInThread ? { ok: true as const, text: subjectTpl } : renderEmailText(subjectTpl, vars, rand);
      const body = renderEmailText(step.body, vars, rand);
      if (!subject.ok || !body.ok) {
        const missing = [...(subject.ok ? [] : subject.missing), ...(body.ok ? [] : body.missing)];
        await prisma.emailLead.update({ where: { id: lead.id }, data: { status: "SKIPPED", nextAt: null, reason: `No value for ${missing.map((m) => `{{${m}}}`).join(", ")} (add a fallback like {{${missing[0]}|there}})` } });
        res.skipped++;
        continue;
      }

      // Unsubscribe: the one-click header always (mail providers show their own button), the visible line if the campaign wants it.
      const urls = unsubscribeUrls(d.origin ?? publicOrigin(), unsubscribeToken(lead.id, d.key));
      const unsubscribe = c.unsubscribeLink ? { text: c.unsubscribeText, url: urls.page } : null;
      const headers = {
        "List-Unsubscribe": `<${urls.oneClick}>, <mailto:${box.email}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
      const r = await sendEmail(
        { ...box, provider: box.provider as never, password: openSecret(box.secret, d.key) },
        { fromName: box.fromName, from: box.email, to: lead.email, subject: subject.text, text: body.text, signature: box.signature, inReplyTo: followUpInThread ? lead.threadMessageId! : undefined, unsubscribe, headers },
        d.sender,
      );
      await prisma.emailSend.create({
        data: {
          workspaceId: c.workspaceId,
          emailAccountId: box.id,
          kind: "CAMPAIGN",
          status: r.ok ? "SENT" : "FAILED",
          toEmail: lead.email,
          subject: subject.text,
          messageId: r.ok ? r.messageId : null,
          error: r.ok ? null : r.error,
          text: emailBody(body.text, box.signature, unsubscribe).text,
          emailLeadId: lead.id,
          stepIndex: lead.stepIndex,
          createdAt: now,
        },
      });
      box.nextSendAt = nextSendAfter(box.gapMinutes, now, rand);
      await prisma.emailAccount.update({ where: { id: box.id }, data: { nextSendAt: box.nextSendAt, ...(r.ok && { lastSentAt: now }) } });

      if (r.ok) {
        res.sent++;
        box.sentToday++;
        box.lastSentAt = now;
        const next = steps.data[lead.stepIndex + 1];
        await prisma.emailLead.update({
          where: { id: lead.id },
          data: {
            emailAccountId: box.id,
            stepIndex: lead.stepIndex + 1,
            lastSentAt: now,
            ...(lead.stepIndex === 0 && { threadMessageId: r.messageId, threadSubject: subject.text }),
            ...(next ? { nextAt: new Date(now.getTime() + next.delayDays * DAY_MS) } : { status: "COMPLETED", nextAt: null }),
          },
        });
      } else if (r.refused) {
        res.bounced++;
        await prisma.emailLead.update({ where: { id: lead.id }, data: { emailAccountId: box.id } });
        await hardBounce(prisma, lead.id, r.error.replace(/^The receiving server refused this address\. /, ""), now);
      } else if (r.temporary) {
        res.bounced++;
        await prisma.emailLead.update({ where: { id: lead.id }, data: { emailAccountId: box.id } });
        await softBounce(prisma, lead.id, lead.stepIndex, r.error, { retries: c.softBounceRetries, retryHours: c.softRetryHours }, now);
      } else {
        // The mailbox couldn't send (login, connection): the lead waits; the mailbox stops after a few failures in a row.
        res.failed++;
        const last = await prisma.emailSend.findMany({ where: { emailAccountId: box.id, kind: { not: "WARMUP" } }, orderBy: { createdAt: "desc" }, take: FAILS_TO_STOP, select: { status: true } });
        if (last.length === FAILS_TO_STOP && last.every((x) => x.status === "FAILED")) {
          box.status = "ERROR";
          await prisma.emailAccount.update({ where: { id: box.id }, data: { status: "ERROR", statusReason: r.error } });
        }
      }
    }

    // Done when no lead has anything left to send.
    if ((await prisma.emailLead.count({ where: { campaignId: c.id, status: "ACTIVE" } })) === 0) {
      await prisma.emailCampaign.update({ where: { id: c.id }, data: { status: "COMPLETED" } });
      res.completed++;
    }
  }
  return res;
}
