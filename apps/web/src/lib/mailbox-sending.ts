import { openSecret, sendEmail, type MailSender, type PrismaClient } from "@invytra/db";
import { localDayStart, type MailboxSettings } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * Email Outreach: each mailbox's sending settings, pause/resume and a test email. Every
 * query is scoped to the signed-in workspace (CLAUDE.md rule 0).
 */

function key(): string {
  const k = process.env.SESSION_ENCRYPTION_KEY;
  if (!k) throw new Error("SESSION_ENCRYPTION_KEY is missing from .env");
  return k;
}

const NOT_FOUND = { ok: false as const, error: "Mailbox not found." };

export async function updateMailboxSettings(prisma: PrismaClient, workspaceId: string, id: string, s: MailboxSettings): Promise<Result> {
  const r = await prisma.emailAccount.updateMany({
    where: { id, workspaceId },
    data: { fromName: s.fromName, dailyLimit: s.dailyLimit, gapMinutes: s.gapMinutes, timeZone: s.timeZone, sendDays: [...new Set(s.days)].sort(), startHour: s.startHour, endHour: s.endHour, signature: s.signature },
  });
  return r.count ? { ok: true, value: undefined } : NOT_FOUND;
}

/** Pause stops all sending from the mailbox; resume lets it send again. */
export async function setMailboxPaused(prisma: PrismaClient, workspaceId: string, id: string, paused: boolean): Promise<Result> {
  const m = await prisma.emailAccount.findFirst({ where: { id, workspaceId }, select: { status: true } });
  if (!m) return NOT_FOUND;
  if (!paused && m.status !== "PAUSED") return { ok: true, value: undefined };
  await prisma.emailAccount.update({ where: { id }, data: { status: paused ? "PAUSED" : "ACTIVE", ...(paused ? {} : { statusReason: null }) } });
  return { ok: true, value: undefined };
}

/** Emails each mailbox has sent today (in its own time zone); warm-up emails don't count. */
export async function sentToday(prisma: PrismaClient, mailboxes: { id: string; timeZone: string }[], now = new Date()): Promise<Map<string, number>> {
  const counts = await Promise.all(
    mailboxes.map((m) => prisma.emailSend.count({ where: { emailAccountId: m.id, status: "SENT", kind: { not: "WARMUP" }, createdAt: { gte: localDayStart(now, m.timeZone) } } })),
  );
  return new Map(mailboxes.map((m, i) => [m.id, counts[i]!]));
}

export const testEmailSchema = z.object({ to: z.string().trim().toLowerCase().max(254).email("Enter the address to send the test to.") });

/** Sends a short test email now (any hour; it counts toward today's limit) and logs it. */
export async function sendTestEmail(
  prisma: PrismaClient,
  workspaceId: string,
  id: string,
  to: string,
  deps: { sender?: MailSender; now?: Date } = {},
): Promise<Result<{ messageId: string }>> {
  const now = deps.now ?? new Date();
  const m = await prisma.emailAccount.findFirst({ where: { id, workspaceId } });
  if (!m) return NOT_FOUND;
  const sent = (await sentToday(prisma, [m], now)).get(m.id) ?? 0;
  if (sent >= m.dailyLimit) return { ok: false, error: `This mailbox already sent ${sent} of its ${m.dailyLimit} emails today. Try again tomorrow, or raise its daily limit.` };
  const subject = "Test email from Invytra";
  const r = await sendEmail(
    { ...m, provider: m.provider, password: openSecret(m.secret, key()) },
    {
      fromName: m.fromName,
      from: m.email,
      to,
      subject,
      text: `Hi,\n\nThis is a test email sent from ${m.email} through Invytra, to check this mailbox can send.\n\nIf it landed in spam or promotions, open the domain health checks on the Mailboxes page.`,
      signature: m.signature,
    },
    deps.sender,
  );
  await prisma.emailSend.create({
    data: { workspaceId, emailAccountId: m.id, kind: "TEST", status: r.ok ? "SENT" : "FAILED", toEmail: to, subject, messageId: r.ok ? r.messageId : null, error: r.ok ? null : r.error, createdAt: now },
  });
  if (!r.ok) return { ok: false, error: r.error };
  await prisma.emailAccount.update({ where: { id: m.id }, data: { lastSentAt: now } });
  return { ok: true, value: { messageId: r.messageId } };
}
