import type { PrismaClient } from "@prisma/client";
import { sendSystemEmail } from "./mail-send.js";

/*
 * Emails Invytra itself sends (password resets…). Resend when RESEND_API_KEY is set
 * (from PLATFORM_EMAIL_FROM, an address on a domain verified in Resend); otherwise a
 * mailbox over SMTP (PLATFORM_SMTP_HOST / _PORT / _USER / _PASS).
 */

export interface PlatformEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where replies go (the From is usually a no-reply address). */
  replyTo?: string;
}
export type PlatformMailer = (mail: PlatformEmail) => Promise<void>;

export const platformMailConfigured = (env: Record<string, string | undefined> = process.env) => !!(env.RESEND_API_KEY || (env.PLATFORM_SMTP_HOST && env.PLATFORM_SMTP_USER && env.PLATFORM_SMTP_PASS));

/** Resend's send-email API: one POST, the key as a bearer token. */
export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): PlatformMailer {
  return async (mail) => {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(`Resend ${res.status}: ${body?.message ?? "request failed"}`);
    }
  };
}

export function platformMailer(env: Record<string, string | undefined> = process.env): PlatformMailer | null {
  if (env.RESEND_API_KEY) return resendMailer(env.RESEND_API_KEY, env.PLATFORM_EMAIL_FROM || "Invytra <onboarding@resend.dev>");
  if (!(env.PLATFORM_SMTP_HOST && env.PLATFORM_SMTP_USER && env.PLATFORM_SMTP_PASS)) return null;
  const smtp = {
    host: env.PLATFORM_SMTP_HOST!,
    port: Number(env.PLATFORM_SMTP_PORT || 465),
    user: env.PLATFORM_SMTP_USER!,
    pass: env.PLATFORM_SMTP_PASS!,
    from: env.PLATFORM_EMAIL_FROM || `Invytra <${env.PLATFORM_SMTP_USER}>`,
  };
  return (mail) => sendSystemEmail(smtp, mail);
}

/** The Invytra logo and name for the top of platform emails (the image is served by the app). */
export const emailBrandHeader = (origin: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
<td valign="middle"><img src="${origin}/logo-128.png" width="40" height="40" alt="Invytra" style="display:block;width:40px;height:40px;border:0;border-radius:10px"></td>
<td valign="middle" style="padding-left:10px;font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#1c1917">Invytra</td>
</tr></table>`;

export const escHtml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Link to a page of the app in an email: on its channel's subdomain when ROOT_DOMAIN is set
 * (whatsapp.invytra.com/…), else on WEB_ORIGIN.
 */
export function appLink(sub: string | null, path: string, env: Record<string, string | undefined> = process.env): string {
  const root = env.ROOT_DOMAIN?.trim().toLowerCase().replace(/^\.+|\/+$/g, "");
  const web = (env.PUBLIC_URL || env.WEB_ORIGIN || "http://localhost:3000").split(",")[0]!.trim().replace(/\/$/, "");
  if (!root) return `${web}${path}`;
  const proto = web.startsWith("https://") ? "https:" : "http:";
  return `${proto}//${sub ?? "app"}.${root}${path}`;
}

/** Owners of a workspace (who get its notices): their email and first name. */
export async function workspaceOwners(prisma: PrismaClient, workspaceId: string): Promise<{ email: string; first: string }[]> {
  const rows = await prisma.membership.findMany({ where: { workspaceId, role: "OWNER" }, select: { user: { select: { email: true, name: true } } } });
  return rows.map((r) => ({ email: r.user.email, first: r.user.name.trim().split(/\s+/)[0] || "there" }));
}

export interface Notice {
  to: string;
  first: string;
  subject: string;
  title: string;
  /** Paragraphs (plain text; escaped in the HTML). */
  lines: string[];
  /** Numbers shown as tiles, e.g. [["Delivered", "1,204"]]. */
  stats?: [string, string][];
  /** A highlighted box, e.g. Meta's rejection reason. */
  callout?: { tone: "good" | "bad" | "info"; text: string };
  button: { label: string; href: string };
  why: string;
}

/** A short notice from Invytra (template reviewed, campaign report …) in the house style. */
export function noticeEmail(n: Notice, env: Record<string, string | undefined> = process.env): PlatformEmail {
  const origin = appLink(null, "", env);
  const replyTo = env.PLATFORM_EMAIL_REPLY_TO?.trim() ?? "";
  const tone = { good: ["#ecfdf5", "#065f46"], bad: ["#fff1f2", "#9f1239"], info: ["#f5f5f4", "#44403c"] } as const;
  const text = [
    `Hi ${n.first},`,
    "",
    ...n.lines.flatMap((l) => [l, ""]),
    ...(n.callout ? [n.callout.text, ""] : []),
    ...(n.stats?.length ? [...n.stats.map(([k, v]) => `${k}: ${v}`), ""] : []),
    `${n.button.label}: ${n.button.href}`,
    "",
    "The Invytra team",
  ].join("\n");
  const stats = n.stats?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border-collapse:separate;border-spacing:6px"><tr>${n.stats
        .map(([k, v]) => `<td style="background:#f5f5f4;border-radius:10px;padding:12px 10px;text-align:center"><div style="font-size:20px;font-weight:700;color:#1c1917">${escHtml(v)}</div><div style="font-size:12px;color:#78716c;margin-top:2px">${escHtml(k)}</div></td>`)
        .join("")}</tr></table>`
    : "";
  const callout = n.callout ? `<div style="background:${tone[n.callout.tone][0]};color:${tone[n.callout.tone][1]};border-radius:10px;padding:12px 14px;margin:0 0 20px;font-size:14px">${escHtml(n.callout.text)}</div>` : "";
  const html = `<div style="background:#f5f5f4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;color:#1c1917;font-size:15px;line-height:1.6">
${emailBrandHeader(origin)}
<p style="margin:0 0 12px;font-size:21px;font-weight:700">${escHtml(n.title)}</p>
<p style="margin:0 0 14px;color:#44403c">Hi ${escHtml(n.first)},</p>
${n.lines.map((l) => `<p style="margin:0 0 14px;color:#44403c">${escHtml(l)}</p>`).join("\n")}
${callout}${stats}
<p style="margin:8px 0 0"><a href="${escHtml(n.button.href)}" style="display:inline-block;background:#1c1917;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${escHtml(n.button.label)}</a></p>
</div>
<p style="max-width:560px;margin:16px auto 0;text-align:center;color:#a8a29e;font-size:12px">${escHtml(n.why)}</p>
</div>`;
  return { to: n.to, subject: n.subject, text, html, ...(replyTo ? { replyTo } : {}) };
}

/** Sends a notice to each owner; a mail problem is logged (without the address) and never thrown. */
export async function sendNotices(send: PlatformMailer | null, mails: PlatformEmail[], what: string): Promise<number> {
  if (!send) return 0;
  let n = 0;
  for (const m of mails) {
    try {
      await send(m);
      n++;
    } catch (e) {
      console.error(`${what} email not sent:`, e instanceof Error ? e.message : e);
    }
  }
  return n;
}
