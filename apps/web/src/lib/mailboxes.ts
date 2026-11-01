import {
  IMAP_PORTS,
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
import { z } from "zod";
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
});
export type ConnectMailboxInput = z.infer<typeof connectMailboxSchema>;

export interface ConnectResult {
  smtp: CheckResult;
  imap: CheckResult;
  /** Set when the mailbox was saved (both checks passed). */
  id?: string;
}

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
  tester?: MailboxTester,
): Promise<Result<ConnectResult>> {
  const taken = await takenProblem(prisma, workspaceId, input.email);
  if (taken) return { ok: false, error: taken };
  const login = { ...input, username: input.username || input.email };
  const checks = await testMailbox(login, tester);
  if (!checks.smtp.ok || !checks.imap.ok) return { ok: true, value: checks };
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
    },
    select: { id: true },
  });
  return { ok: true, value: { ...checks, id: saved.id } };
}

/** Logs in again with the saved details and records whether it still works. */
export async function recheckMailbox(prisma: PrismaClient, workspaceId: string, id: string, tester?: MailboxTester): Promise<Result<ConnectResult>> {
  const m = await prisma.emailAccount.findFirst({ where: { id, workspaceId } });
  if (!m) return { ok: false, error: "Mailbox not found." };
  const checks = await testMailbox({ ...m, password: openSecret(m.secret, key()) }, tester);
  const ok = checks.smtp.ok && checks.imap.ok;
  await prisma.emailAccount.update({
    where: { id: m.id },
    data: {
      lastCheckedAt: new Date(),
      ...(ok ? { status: m.status === "PAUSED" ? "PAUSED" : "ACTIVE", statusReason: null } : { status: "ERROR", statusReason: checks.smtp.error ?? checks.imap.error ?? null }),
    },
  });
  return { ok: true, value: checks };
}

export async function removeMailbox(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const r = await prisma.emailAccount.deleteMany({ where: { id, workspaceId } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "Mailbox not found." };
}

/** The workspace's mailboxes, without their passwords. */
export function listMailboxes(prisma: PrismaClient, workspaceId: string) {
  return prisma.emailAccount.findMany({
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
      lastCheckedAt: true,
      createdAt: true,
    },
  });
}
export type MailboxRow = Awaited<ReturnType<typeof listMailboxes>>[number];
