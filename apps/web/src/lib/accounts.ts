import { isSealed, openSecret, sealSecret, unipileFromEnv, type PrismaClient } from "@invytra/db";
import {
  DEFAULT_LIMITS,
  DEFAULT_WORKING_HOURS,
  MAX_LIMITS,
  limitsSchema,
  warmupEndFrom,
  workingHoursSchema,
} from "@invytra/shared";
import { z } from "zod";

/*
 * LinkedIn account management for the dashboard. Every function takes the
 * signed-in workspace id FIRST and only touches that workspace's accounts.
 */

export class AccountNotFoundError extends Error {
  constructor() {
    super("Account not found.");
  }
}

const label = z
  .string()
  .trim()
  .min(1, "Give the account a name.")
  .max(40, "Keep the name under 40 characters.")
  .regex(/^[\p{L}\p{N} ._'-]+$/u, "Use letters, numbers, spaces, dots, dashes or underscores.");

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
const timezone = z.string().refine(isValidTimeZone, "Choose a valid time zone.");

/** http(s)://user:pass@host:port or socks5://…; empty allowed only where the server permits it. */
export const proxySchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return ["http:", "https:", "socks5:"].includes(u.protocol) && !!u.hostname && !!u.port;
    } catch {
      return false;
    }
  }, "Proxy must look like http://user:password@host:port");

export const newAccountSchema = z.object({
  label,
  timezone,
  proxyUrl: proxySchema,
  warmup: z.boolean(),
});
export type NewAccount = z.infer<typeof newAccountSchema>;

export const settingsSchema = z.object({
  label,
  timezone,
  limits: limitsSchema,
  workingHours: workingHoursSchema,
  warmup: z.boolean(),
  /** Omitted or empty = keep the current proxy. */
  proxyUrl: proxySchema.optional(),
  removeProxy: z.boolean().default(false),
});
export type AccountSettingsInput = z.infer<typeof settingsSchema>;

/**
 * Whether a new account must come with its own proxy. Not when Unipile is set up (accounts
 * without a proxy connect through Unipile, which gives them an IP), nor on dev servers
 * (ALLOW_NO_PROXY). Otherwise each account needs one.
 */
export function proxyRequired(): boolean {
  const unipile = !!(process.env.UNIPILE_DSN?.trim() && process.env.UNIPILE_API_KEY?.trim());
  return !unipile && process.env.ALLOW_NO_PROXY !== "true";
}

function key(): string {
  const k = process.env.SESSION_ENCRYPTION_KEY;
  if (!k) throw new Error("SESSION_ENCRYPTION_KEY is missing from .env");
  return k;
}

/**
 * What makes two proxies "the same": host, port and username (providers often give
 * every IP the same gateway host with a different username). The password is ignored.
 */
export function proxyKey(plain: string): string | null {
  try {
    const u = new URL(plain.trim());
    if (!u.hostname || !u.port) return null;
    return `${u.hostname.toLowerCase()}:${u.port}:${decodeURIComponent(u.username)}`;
  } catch {
    return null;
  }
}

function storedProxyKey(stored: string): string | null {
  if (!stored) return null;
  try {
    return proxyKey(isSealed(stored) ? openSecret(stored, key()) : stored);
  } catch {
    return null; // saved under another key: can't compare
  }
}

/**
 * Another LinkedIn account already using this proxy, or null. Checked across all of
 * Invytra (two customers on one IP look linked to LinkedIn too); another workspace's
 * account is never named.
 */
export async function proxyInUse(
  prisma: PrismaClient,
  workspaceId: string,
  proxyUrl: string,
  exceptAccountId?: string,
): Promise<{ label: string | null } | null> {
  const want = proxyKey(proxyUrl);
  if (!want) return null;
  const others = await prisma.linkedinAccount.findMany({
    where: { proxyUrl: { not: "" }, ...(exceptAccountId && { id: { not: exceptAccountId } }) },
    select: { label: true, workspaceId: true, proxyUrl: true },
  });
  const hit = others.find((o) => storedProxyKey(o.proxyUrl) === want);
  if (!hit) return null;
  return { label: hit.workspaceId === workspaceId ? hit.label : null };
}

const proxyTaken = (hit: { label: string | null }) =>
  hit.label
    ? `This proxy is already used by “${hit.label}”. Each LinkedIn account needs its own proxy, so buy another one for this account.`
    : "This proxy is already used by another LinkedIn account on Invytra. Each LinkedIn account needs its own proxy.";

/** Groups of this workspace's accounts that share one proxy (for a warning on the Accounts page). */
export async function sharedProxyGroups(prisma: PrismaClient, workspaceId: string): Promise<string[][]> {
  const rows = await prisma.linkedinAccount.findMany({ where: { workspaceId, proxyUrl: { not: "" } }, select: { label: true, proxyUrl: true } });
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const k = storedProxyKey(r.proxyUrl);
    if (k) groups.set(k, [...(groups.get(k) ?? []), r.label]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** "proxy.example.com:8000" — never the username or password. */
export function proxyHost(stored: string): string | null {
  if (!stored) return null;
  try {
    const u = new URL(isSealed(stored) ? openSecret(stored, key()) : stored);
    return `${u.hostname}:${u.port}`;
  } catch {
    return "saved";
  }
}

export async function getAccount(prisma: PrismaClient, workspaceId: string, accountId: string) {
  const a = await prisma.linkedinAccount.findFirst({ where: { id: accountId, workspaceId } });
  if (!a) throw new AccountNotFoundError();
  return a;
}

async function labelTaken(prisma: PrismaClient, workspaceId: string, name: string, exceptId?: string) {
  const other = await prisma.linkedinAccount.findFirst({
    where: { workspaceId, label: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  return !!other;
}

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export async function createAccount(prisma: PrismaClient, workspaceId: string, input: NewAccount): Promise<Result<string>> {
  if (!input.proxyUrl && proxyRequired()) {
    return { ok: false, error: "Add the proxy for this account. Each LinkedIn account needs its own proxy." };
  }
  if (await labelTaken(prisma, workspaceId, input.label)) return { ok: false, error: "You already have an account with that name." };
  if (input.proxyUrl) {
    const hit = await proxyInUse(prisma, workspaceId, input.proxyUrl);
    if (hit) return { ok: false, error: proxyTaken(hit) };
  }
  const a = await prisma.linkedinAccount.create({
    data: {
      workspaceId,
      label: input.label,
      timezone: input.timezone,
      proxyUrl: sealSecret(input.proxyUrl, key()),
      status: "DISCONNECTED",
      statusReason: null,
      workingHours: DEFAULT_WORKING_HOURS,
      limits: DEFAULT_LIMITS,
      warmupUntil: input.warmup ? warmupEndFrom() : null,
    },
    select: { id: true },
  });
  return { ok: true, value: a.id };
}

export async function updateSettings(
  prisma: PrismaClient,
  workspaceId: string,
  accountId: string,
  input: AccountSettingsInput,
): Promise<Result> {
  const current = await getAccount(prisma, workspaceId, accountId);
  if (await labelTaken(prisma, workspaceId, input.label, accountId)) return { ok: false, error: "You already have an account with that name." };
  for (const [k, max] of Object.entries(MAX_LIMITS)) {
    if ((input.limits as Record<string, unknown>)[k] as number > max) return { ok: false, error: "A limit is above the safe maximum." };
  }
  let proxyUrl = current.proxyUrl;
  if (input.removeProxy) {
    if (proxyRequired()) return { ok: false, error: "Each LinkedIn account needs its own proxy." };
    proxyUrl = "";
  } else if (input.proxyUrl) {
    const hit = await proxyInUse(prisma, workspaceId, input.proxyUrl, current.id);
    if (hit) return { ok: false, error: proxyTaken(hit) };
    proxyUrl = sealSecret(input.proxyUrl, key());
  }
  // Warm-up: switching it on starts a fresh ramp; leaving it on keeps the current end date.
  const warmupUntil = input.warmup ? (current.warmupUntil && current.warmupUntil > new Date() ? current.warmupUntil : warmupEndFrom()) : null;
  await prisma.linkedinAccount.update({
    where: { id: current.id },
    data: {
      label: input.label,
      timezone: input.timezone,
      limits: input.limits,
      workingHours: input.workingHours,
      proxyUrl,
      warmupUntil,
    },
  });
  return { ok: true, value: undefined };
}

export async function setPaused(prisma: PrismaClient, workspaceId: string, accountId: string, paused: boolean): Promise<Result> {
  const a = await getAccount(prisma, workspaceId, accountId);
  if (paused) {
    if (a.status !== "ACTIVE") return { ok: false, error: "Only a connected account can be paused." };
    await prisma.linkedinAccount.update({ where: { id: a.id }, data: { status: "PAUSED", statusReason: "Paused from the dashboard" } });
  } else {
    if (a.status !== "PAUSED") return { ok: false, error: "This account isn't paused." };
    await prisma.linkedinAccount.update({ where: { id: a.id }, data: { status: "ACTIVE", statusReason: null } });
  }
  return { ok: true, value: undefined };
}

/** "I've checked LinkedIn, carry on" — only with a saved session, and never after a restriction. */
export async function resumeAfterCheck(prisma: PrismaClient, workspaceId: string, accountId: string): Promise<Result> {
  const a = await getAccount(prisma, workspaceId, accountId);
  if (a.status !== "NEEDS_ATTENTION") return { ok: false, error: "This account doesn't need attention." };
  if (!a.encryptedSession && !a.unipileAccountId) return { ok: false, error: "Reconnect this account. There is no saved login." };
  if (problemOf(a.statusReason) === "RESTRICTED") return { ok: false, error: "LinkedIn restricted this account. Check LinkedIn directly first." };
  await prisma.linkedinAccount.update({ where: { id: a.id }, data: { status: "ACTIVE", statusReason: null } });
  return { ok: true, value: undefined };
}

/** Deletes the account with its saved login, queued actions and fetched replies. */
export async function removeAccount(prisma: PrismaClient, workspaceId: string, accountId: string): Promise<Result> {
  const a = await getAccount(prisma, workspaceId, accountId);
  if (await prisma.action.count({ where: { accountId: a.id, status: "RUNNING" } })) {
    return { ok: false, error: "An action is running on this account right now. Try again in a minute." };
  }
  await prisma.linkedinAccount.delete({ where: { id: a.id } });
  // Its Unipile connection goes too (Unipile bills per connected account).
  if (a.unipileAccountId) await unipileFromEnv()?.deleteAccount(a.unipileAccountId).catch(() => undefined);
  return { ok: true, value: undefined };
}

/* ---------- Plain-language status ---------- */

export type Problem = "NOT_CONNECTED" | "LOGGED_OUT" | "CHECKPOINT" | "CAPTCHA" | "RESTRICTED" | "PAUSED" | "OTHER";

/** The worker stores short codes (and server file paths) — map them to a kind. */
export function problemOf(reason: string | null): Problem | null {
  if (!reason) return null;
  const r = reason.toUpperCase();
  if (r.startsWith("RESTRICTED")) return "RESTRICTED";
  if (r.startsWith("CHECKPOINT")) return "CHECKPOINT";
  if (r.startsWith("CAPTCHA")) return "CAPTCHA";
  if (r.startsWith("LOGGED_OUT") || r.startsWith("NO_SESSION")) return "LOGGED_OUT";
  if (r.startsWith("NOT LOGGED IN")) return "NOT_CONNECTED";
  if (r.startsWith("PAUSED")) return "PAUSED";
  return "OTHER";
}

export interface StatusExplanation {
  title: string;
  body: string;
  tone: "ok" | "warn" | "danger" | "neutral";
  /** What the main button should do. */
  next: "connect" | "reconnect" | "resume" | "none";
}

export function explainStatus(status: string, reason: string | null, hasSession: boolean): StatusExplanation {
  if (status === "ACTIVE") return { title: "Running", body: "Actions run inside your working hours and daily limits.", tone: "ok", next: "none" };
  if (status === "PAUSED") return { title: "Paused", body: "Nothing runs until you resume. Queued actions wait.", tone: "warn", next: "resume" };
  if (status === "DISCONNECTED" || !hasSession) {
    return {
      title: "Not connected",
      body: "Log in to LinkedIn in a secure window. Invytra keeps the session, never your password.",
      tone: "neutral",
      next: "connect",
    };
  }
  switch (problemOf(reason)) {
    case "CHECKPOINT":
      return { title: "LinkedIn wants to verify it's you", body: "Reconnect and complete LinkedIn's check in the login window. Everything is on hold until then.", tone: "danger", next: "reconnect" };
    case "CAPTCHA":
      return { title: "LinkedIn showed a security check", body: "Reconnect and finish the check in the login window. Invytra never solves these itself.", tone: "danger", next: "reconnect" };
    case "LOGGED_OUT":
      return { title: "LinkedIn logged this account out", body: "This happens now and then. Reconnect to carry on where it stopped.", tone: "danger", next: "reconnect" };
    case "RESTRICTED":
      return { title: "LinkedIn restricted this account", body: "Log in to LinkedIn yourself and follow its instructions. Invytra keeps everything stopped.", tone: "danger", next: "none" };
    default:
      return { title: "Stopped for safety", body: "Something unexpected showed up on LinkedIn. Reconnect to check the account.", tone: "danger", next: "reconnect" };
  }
}
