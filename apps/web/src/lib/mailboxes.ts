import {
  IMAP_PORTS,
  checkDomainDns,
  type DnsLookup,
  type DomainDns,
  MAILBOX_PRESETS,
  SMTP_PORTS,
  openSecret,
  sealSecret,
  testMailbox,
  type CheckResult,
  type MailboxProviderId,
  type MailboxTester,
  type PrismaClient,
} from "@invytra/db";
import { EMAIL_LIMITS, timeZoneSchema } from "@invytra/shared";
import { z } from "zod";
import { sentToday } from "./mailbox-sending";
import type { Result } from "./accounts";

/*
 * Email Outreach mailboxes: connect a mailbox on the customer's own domain (checked by
 * logging in to its SMTP and IMAP servers), list, check again, remove. Every query is
 * scoped to the signed-in workspace (CLAUDE.md rule 0). Passwords are stored encrypted
 * and never sent back to the browser.
 */

const PROVIDERS = Object.keys(MAILBOX_PRESETS) as [MailboxProviderId, ...MailboxProviderId[]];
const host = z.string().trim().toLowerCase().min(3, "Enter the server name.").max(253);

export const connectMailboxSchema = z.object({
  provider: z.enum(PROVIDERS),
  email: z.string().trim().toLowerCase().max(254).email("Enter the mailbox's email address."),
  fromName: z.string().trim().min(1, "Enter the name people see as the sender.").max(80),
  /** Login name; empty = the email address. */
  username: z.string().trim().max(254).optional(),
  password: z.string().min(1, "Enter the mailbox password (or app password).").max(500),
  smtpHost: host,
  smtpPort: z.number().int().refine((p) => (SMTP_PORTS as readonly number[]).includes(p), `SMTP port must be one of ${SMTP_PORTS.join(", ")}.`),
  smtpSecure: z.boolean(),
  imapHost: host,
  imapPort: z.number().int().refine((p) => (IMAP_PORTS as readonly number[]).includes(p), `IMAP port must be one of ${IMAP_PORTS.join(", ")}.`),
  /** The browser's time zone: the mailbox sends in it unless changed. */
  timeZone: timeZoneSchema.optional(),
});
export type ConnectMailboxInput = z.infer<typeof connectMailboxSchema>;

export interface ConnectResult {
  smtp: CheckResult;
  imap: CheckResult;
  /** Set when the mailbox was saved (both checks passed). */
  id?: string;
  /** The domain's email DNS, checked once the mailbox works. */
  dns?: DomainDns;
}

/** Test doubles: the mail login check and the DNS lookups. */
export interface MailboxDeps {
  tester?: MailboxTester;
  dns?: DnsLookup;
}

const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1);
const dnsJson = (d: DomainDns) => d as unknown as object;

function key(): string {
  const k = process.env.SESSION_ENCRYPTION_KEY;
  if (!k) throw new Error("SESSION_ENCRYPTION_KEY is missing from .env");
  return k;
}

/** Whether this address is already connected: here (named) or by another user (not named). */
async function takenProblem(prisma: PrismaClient, workspaceId: string, email: string, exceptId?: string): Promise<string | null> {
  const other = await prisma.emailAccount.findFirst({ where: { email, ...(exceptId && { id: { not: exceptId } }) }, select: { workspaceId: true } });
  if (!other) return null;
  return other.workspaceId === workspaceId ? "This mailbox is already connected here." : "This mailbox is already on Invytra under a different user.";
}

/** Checks the mailbox can send and read, and saves it only if both work. */
export async function connectMailbox(
  prisma: PrismaClient,
  workspaceId: string,
  input: ConnectMailboxInput,
  deps: MailboxDeps = {},
): Promise<Result<ConnectResult>> {
  const taken = await takenProblem(prisma, workspaceId, input.email);
  if (taken) return { ok: false, error: taken };
  const login = { ...input, username: input.username || input.email, provider: input.provider };
  const checks = await testMailbox(login, deps.tester);
  if (!checks.smtp.ok || !checks.imap.ok) return { ok: true, value: checks };
  const dns = await checkDomainDns(domainOf(input.email), input.provider, deps.dns);
  const saved = await prisma.emailAccount.create({
    data: {
      workspaceId,
      email: input.email,
      fromName: input.fromName,
      provider: input.provider,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      username: login.username,
      secret: sealSecret(input.password, key()),
      status: "ACTIVE",
      lastCheckedAt: new Date(),
      dns: dnsJson(dns),
      dailyLimit: EMAIL_LIMITS.defaultDaily,
      gapMinutes: EMAIL_LIMITS.defaultGapMinutes,
      ...(input.timeZone && { timeZone: input.timeZone }),
    },
    select: { id: true },
  });
  return { ok: true, value: { ...checks, id: saved.id, dns } };
}

/** Logs in again with the saved details and checks the domain's DNS again. */
export async function recheckMailbox(prisma: PrismaClient, workspaceId: string, id: string, deps: MailboxDeps = {}): Promise<Result<ConnectResult>> {
  const m = await prisma.emailAccount.findFirst({ where: { id, workspaceId } });
  if (!m) return { ok: false, error: "Mailbox not found." };
  const [checks, dns] = await Promise.all([
    testMailbox({ ...m, provider: m.provider, password: openSecret(m.secret, key()) }, deps.tester),
    checkDomainDns(domainOf(m.email), m.provider, deps.dns),
  ]);
  const ok = checks.smtp.ok && checks.imap.ok;
  await prisma.emailAccount.update({
    where: { id: m.id },
    data: {
      lastCheckedAt: new Date(),
      dns: dnsJson(dns),
      ...(ok ? { status: m.status === "PAUSED" ? "PAUSED" : "ACTIVE", statusReason: null } : { status: "ERROR", statusReason: checks.smtp.error ?? checks.imap.error ?? null }),
    },
  });
  return { ok: true, value: { ...checks, dns } };
}

export async function removeMailbox(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const r = await prisma.emailAccount.deleteMany({ where: { id, workspaceId } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "Mailbox not found." };
}

/** The workspace's mailboxes with today's sent count, without their passwords. */
export async function listMailboxes(prisma: PrismaClient, workspaceId: string, now = new Date()) {
  const rows = await prisma.emailAccount.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      fromName: true,
      provider: true,
      smtpHost: true,
      imapHost: true,
      status: true,
      statusReason: true,
      dailyLimit: true,
      gapMinutes: true,
      timeZone: true,
      sendDays: true,
      startHour: true,
      endHour: true,
      signature: true,
      lastSentAt: true,
      lastCheckedAt: true,
      replyError: true,
      lastReplyCheckAt: true,
      createdAt: true,
      dns: true,
    },
  });
  const sent = await sentToday(prisma, rows, now);
  return rows.map((r) => ({ ...r, dns: (r.dns ?? null) as DomainDns | null, sentToday: sent.get(r.id) ?? 0 }));
}
export type MailboxRow = Awaited<ReturnType<typeof listMailboxes>>[number];
