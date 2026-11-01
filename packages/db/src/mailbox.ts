import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

/*
 * Mailboxes on the customer's own domain (Email Outreach): SMTP to send, IMAP to read
 * replies. Server-side only; passwords never leave the server and are never logged.
 */

export type MailboxProviderId = "GOOGLE" | "MICROSOFT" | "ZOHO" | "HOSTINGER" | "GODADDY" | "OTHER";

export interface MailServerSettings {
  smtpHost: string;
  smtpPort: number;
  /** true = TLS from the start (port 465); false = STARTTLS (587). */
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
}

export interface MailboxPreset extends MailServerSettings {
  id: MailboxProviderId;
  name: string;
  /** How to get the password Invytra needs, in plain words. */
  passwordHelp: string;
}

export const MAILBOX_PRESETS: Record<MailboxProviderId, MailboxPreset> = {
  GOOGLE: {
    id: "GOOGLE",
    name: "Google Workspace / Gmail",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    passwordHelp: "Use an app password: Google Account → Security → 2-Step Verification (on) → App passwords. IMAP must be on in Gmail settings.",
  },
  MICROSOFT: {
    id: "MICROSOFT",
    name: "Microsoft 365 / Outlook",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "outlook.office365.com",
    imapPort: 993,
    passwordHelp: "Your admin must allow “Authenticated SMTP” and IMAP for this mailbox. With two-step sign-in, use an app password.",
  },
  ZOHO: {
    id: "ZOHO",
    name: "Zoho Mail",
    smtpHost: "smtp.zoho.in",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.zoho.in",
    imapPort: 993,
    passwordHelp: "Turn on IMAP in Zoho Mail settings; with two-factor sign-in, create an app-specific password. Outside India use smtp.zoho.com / imap.zoho.com.",
  },
  HOSTINGER: {
    id: "HOSTINGER",
    name: "Hostinger",
    smtpHost: "smtp.hostinger.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.hostinger.com",
    imapPort: 993,
    passwordHelp: "The mailbox's own password (set in hPanel → Emails).",
  },
  GODADDY: {
    id: "GODADDY",
    name: "GoDaddy",
    smtpHost: "smtpout.secureserver.net",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.secureserver.net",
    imapPort: 993,
    passwordHelp: "The mailbox's own password. For GoDaddy-hosted Microsoft 365, choose Microsoft 365 instead.",
  },
  OTHER: {
    id: "OTHER",
    name: "Other (SMTP / IMAP)",
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "",
    imapPort: 993,
    passwordHelp: "The mailbox password your email host gave you, and its SMTP / IMAP server names (in its help pages).",
  },
};

export const SMTP_PORTS = [465, 587, 25, 2525] as const;
export const IMAP_PORTS = [993, 143] as const;

/** Addresses that are this server or a private network: never connect there on a customer's behalf. */
function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? isPrivateAddress(mapped[1]!) : false;
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export class MailHostError extends Error {}

/** A host name of a public mail server (not an address on this server's network). */
export async function checkMailHost(host: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const h = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(h) || !h.includes(".") || isIP(h)) throw new MailHostError(`“${host}” isn't a mail server name (like smtp.example.com).`);
  if (env.ALLOW_PRIVATE_MAIL_HOSTS === "true") return;
  let addrs: { address: string }[];
  try {
    addrs = await lookup(h, { all: true });
  } catch {
    throw new MailHostError(`Couldn't find the server “${host}”. Check the name.`);
  }
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new MailHostError(`“${host}” points to a private network address, so it can't be used.`);
}

export interface MailboxLogin extends MailServerSettings {
  username: string;
  password: string;
}

export interface CheckResult {
  ok: boolean;
  /** Plain-language reason when it failed. */
  error?: string;
}

/** Turns a mail server error into something a person can act on (never echoes the password). */
export function explainMailError(e: unknown, what: "SMTP" | "IMAP", provider?: MailboxProviderId): string {
  const err = e as { code?: string; responseCode?: number; authenticationFailed?: boolean; message?: string; response?: string; responseText?: string };
  const msg = String(err?.message ?? "");
  if (err?.code === "EAUTH" || err?.authenticationFailed || err?.responseCode === 535 || /auth|credentials|password|login failed|invalid login/i.test(msg)) {
    // What the server itself replied (it never contains the password), to tell causes apart.
    const said = String(err?.response ?? err?.responseText ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const hint =
      provider === "GOOGLE" || provider === "MICROSOFT"
        ? "Use an app password, not the normal one."
        : provider === "HOSTINGER"
          ? "If unsure, set a new password in hPanel → Emails → this mailbox, wait a minute, and try again."
          : "Check the password with your email host.";
    return `The server didn't accept this email and password. ${hint}${said ? ` (Server said: ${said})` : ""}`;
  }
  if (err?.code === "ENOTFOUND" || err?.code === "EDNS") return `Couldn't find the ${what} server. Check its name.`;
  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || err?.code === "ECONNREFUSED" || /timeout|establish connection|required time/i.test(msg)) {
    return `Couldn't reach the ${what} server on that port. Check the server name and port.`;
  }
  if (/certificate|tls|ssl|wrong version/i.test(msg)) return `Secure connection to the ${what} server failed. Check the port (SMTP: 465 = SSL, 587 = STARTTLS).`;
  return `${what} connection failed: ${msg.replace(/\s+/g, " ").slice(0, 160) || "unknown error"}`;
}

export interface MailboxTester {
  smtp(login: MailboxLogin): Promise<void>;
  imap(login: MailboxLogin): Promise<void>;
}

const TIMEOUT_MS = 15_000;

/** The real connection checks: log in to SMTP (without sending) and to IMAP. */
export const realMailboxTester: MailboxTester = {
  async smtp(l) {
    const t = nodemailer.createTransport({
      host: l.smtpHost,
      port: l.smtpPort,
      secure: l.smtpSecure,
      requireTLS: !l.smtpSecure,
      auth: { user: l.username, pass: l.password },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    try {
      await t.verify();
    } finally {
      t.close();
    }
  },
  async imap(l) {
    const c = new ImapFlow({
      host: l.imapHost,
      port: l.imapPort,
      secure: l.imapPort === 993,
      auth: { user: l.username, pass: l.password },
      logger: false,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    c.on("error", () => undefined);
    await c.connect();
    await c.logout().catch(() => c.close());
  },
};

/** Checks that a mailbox can send (SMTP) and read replies (IMAP), both at once. */
export async function testMailbox(
  login: MailboxLogin & { provider?: MailboxProviderId },
  tester: MailboxTester = realMailboxTester,
): Promise<{ smtp: CheckResult; imap: CheckResult }> {
  const run = async (what: "SMTP" | "IMAP", host: string, fn: () => Promise<void>): Promise<CheckResult> => {
    try {
      await checkMailHost(host);
      await fn();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof MailHostError ? e.message : explainMailError(e, what, login.provider) };
    }
  };
  const [smtp, imap] = await Promise.all([
    run("SMTP", login.smtpHost, () => tester.smtp(login)),
    run("IMAP", login.imapHost, () => tester.imap(login)),
  ]);
  return { smtp, imap };
}
