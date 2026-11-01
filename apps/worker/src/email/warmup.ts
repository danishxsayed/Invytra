import {
  openSecret,
  realWarmupInbox,
  sendEmail,
  warmupCode,
  warmupEmail,
  warmupReply,
  type MailSender,
  type MailboxLogin,
  type PrismaClient,
  type WarmupInbox,
} from "@invytra/db";
import { EMAIL_WARMUP, emailWarmupDue, localDayStart, pickWarmupPartner } from "@invytra/shared";

/*
 * Email warm-up, run every minute by the worker:
 *  1. each pool mailbox that is due sends one warm-up email to another pool mailbox;
 *  2. warm-up emails sent a few minutes ago are looked up in the receiving mailbox: where
 *     they landed (inbox / spam) is recorded, they're marked read and moved to the
 *     "Invytra Warmup" folder (out of spam), and some get a reply.
 * The pool is every warm-up mailbox on the platform. Passwords are only decrypted here.
 */

export interface WarmupDeps {
  prisma: PrismaClient;
  key: string;
  sender?: MailSender;
  inbox?: WarmupInbox;
  now?: Date;
  rand?: () => number;
  /** At most this many receiving-side checks per tick. */
  maxChecks?: number;
}

export interface WarmupTickResult {
  sent: number;
  failed: number;
  checked: number;
  spam: number;
  replied: number;
}

type Mailbox = Awaited<ReturnType<PrismaClient["emailAccount"]["findMany"]>>[number];

/** After this many warm-up sends fail in a row, the mailbox is marked "needs attention". */
const FAILS_TO_STOP = 3;

export async function warmupTick(d: WarmupDeps): Promise<WarmupTickResult> {
  const { prisma } = d;
  const now = d.now ?? new Date();
  const rand = d.rand ?? Math.random;
  const res: WarmupTickResult = { sent: 0, failed: 0, checked: 0, spam: 0, replied: 0 };
  const login = (m: Mailbox): MailboxLogin & { provider: Mailbox["provider"] } => ({ ...m, provider: m.provider, password: openSecret(m.secret, d.key) });

  const pool = await prisma.emailAccount.findMany({ where: { warmupEnabled: true, status: "ACTIVE" } });

  const send = async (from: Mailbox, to: Mailbox, mail: { subject: string; text: string; code: string; inReplyTo?: string; isReply?: boolean }) => {
    const r = await sendEmail(login(from), { fromName: from.fromName, from: from.email, to: to.email, subject: mail.subject, text: mail.text, inReplyTo: mail.inReplyTo }, d.sender);
    await prisma.emailSend.create({
      data: {
        workspaceId: from.workspaceId,
        emailAccountId: from.id,
        kind: "WARMUP",
        status: r.ok ? "SENT" : "FAILED",
        toEmail: to.email,
        toAccountId: to.id,
        subject: mail.subject,
        warmupCode: mail.code,
        isReply: mail.isReply ?? false,
        messageId: r.ok ? r.messageId : null,
        error: r.ok ? null : r.error,
        createdAt: now,
      },
    });
    await prisma.emailAccount.update({ where: { id: from.id }, data: { lastWarmupAt: now } });
    if (!r.ok) {
      res.failed++;
      const last = await prisma.emailSend.findMany({ where: { emailAccountId: from.id, kind: "WARMUP" }, orderBy: { createdAt: "desc" }, take: FAILS_TO_STOP, select: { status: true } });
      if (last.length === FAILS_TO_STOP && last.every((x) => x.status === "FAILED")) {
        await prisma.emailAccount.update({ where: { id: from.id }, data: { status: "ERROR", statusReason: r.error } });
      }
    }
    return r;
  };

  // 1. Send what's due.
  for (const m of pool) {
    const warmupSentToday = await prisma.emailSend.count({ where: { emailAccountId: m.id, kind: "WARMUP", status: "SENT", createdAt: { gte: localDayStart(now, m.timeZone) } } });
    if (!emailWarmupDue({ ...m, warmupSentToday }, now)) continue;
    const partner = pickWarmupPartner(m, pool, rand);
    if (!partner) continue;
    const code = warmupCode();
    const r = await send(m, partner, { ...warmupEmail(m.fromName, partner.fromName, code, rand), code });
    if (r.ok) res.sent++;
  }

  // 2. Check where earlier ones landed, one login per receiving mailbox.
  const pending = await prisma.emailSend.findMany({
    where: {
      kind: "WARMUP",
      status: "SENT",
      landedIn: null,
      toAccountId: { not: null },
      warmupCode: { not: null },
      createdAt: { lte: new Date(now.getTime() - EMAIL_WARMUP.checkAfterMinutes * 60_000), gte: new Date(now.getTime() - 48 * 3_600_000) },
    },
    orderBy: { createdAt: "asc" },
    take: d.maxChecks ?? 100,
    include: { emailAccount: true, toAccount: true },
  });
  const byReceiver = new Map<string, typeof pending>();
  for (const p of pending) byReceiver.set(p.toAccountId!, [...(byReceiver.get(p.toAccountId!) ?? []), p]);

  for (const items of byReceiver.values()) {
    const receiver = items[0]!.toAccount!;
    if (receiver.status === "ERROR") continue;
    let session;
    try {
      session = await (d.inbox ?? realWarmupInbox).open(login(receiver));
    } catch {
      continue; // Can't log in right now: try again next tick (the connect checks report bad passwords).
    }
    try {
      for (const s of items) {
        const landed = await session.handle(s.warmupCode!).catch(() => null);
        const old = now.getTime() - s.createdAt.getTime() > EMAIL_WARMUP.missingAfterHours * 3_600_000;
        if (!landed && !old) continue;
        await prisma.emailSend.update({ where: { id: s.id }, data: { landedIn: landed ?? "MISSING", checkedAt: now } });
        res.checked++;
        if (landed === "SPAM") res.spam++;
        // Some get a reply, threaded under the original.
        const original = s.emailAccount;
        if (landed && !s.isReply && receiver.warmupEnabled && receiver.status === "ACTIVE" && original.status === "ACTIVE" && rand() * 100 < receiver.warmupReplyRate) {
          const code = warmupCode();
          const r = await send(receiver, original, { ...warmupReply(s.subject, receiver.fromName, code, rand), code, inReplyTo: s.messageId ?? undefined, isReply: true });
          if (r.ok) res.replied++;
        }
      }
    } finally {
      await session.close().catch(() => undefined);
    }
  }
  return res;
}
