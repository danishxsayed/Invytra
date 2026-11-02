import nodemailer from "nodemailer";
import { MailHostError, checkMailHost, explainMailError, type MailboxLogin, type MailboxProviderId } from "./mailbox.js";

/*
 * Sending one email from a customer's mailbox over its own SMTP server. Plain text plus a
 * matching simple HTML part (no images, no tracking yet): what deliverability likes best.
 */

export interface OutgoingEmail {
  fromName: string;
  from: string;
  to: string;
  subject: string;
  /** Plain-text body; the signature is added by emailBody(). */
  text: string;
  /** For a reply: the Message-ID it answers (threads it in the recipient's mailbox). */
  inReplyTo?: string;
  /** Extra headers (List-Unsubscribe …). */
  headers?: Record<string, string>;
  /** Preview text: the line inboxes show after the subject (hidden in the email itself). */
  preview?: string;
}

/** An unsubscribe line: its text ([brackets] mark the linked words) and where it links. */
export interface UnsubscribeLine {
  text: string;
  url: string;
}

export interface MailSender {
  send(login: MailboxLogin, mail: OutgoingEmail & { html: string }): Promise<{ messageId: string }>;
}

/**
 * refused: the receiving server rejected the address itself (a hard bounce), not our login.
 * temporary: it refused for now (mailbox full, try later: a soft bounce).
 */
export type SendResult = { ok: true; messageId: string } | { ok: false; error: string; refused?: boolean; temporary?: boolean };

const TIMEOUT_MS = 20_000;

export const realMailSender: MailSender = {
  async send(l, mail) {
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
      const info = await t.sendMail({
        from: { name: mail.fromName, address: mail.from },
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.inReplyTo && { inReplyTo: mail.inReplyTo, references: mail.inReplyTo }),
        ...(mail.headers && { headers: mail.headers }),
      });
      return { messageId: info.messageId };
    } finally {
      t.close();
    }
  },
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const UNSUB_TOKEN = /\{\{\s*unsubscribe\s*\}\}|\{unsubscribe\}/gi;

/** The unsubscribe line as plain text ("… Unsubscribe here: <url>") and as HTML (the bracketed words linked). */
function unsubscribeParts(u: UnsubscribeLine): { text: string; html: string } {
  const m = /\[([^\]]+)\]/.exec(u.text);
  const plain = u.text.replace(/\[([^\]]+)\]/, "$1").trim();
  const href = escapeHtml(u.url);
  const html = m
    ? escapeHtml(u.text.slice(0, m.index)) + `<a href="${href}">${escapeHtml(m[1]!)}</a>` + escapeHtml(u.text.slice(m.index + m[0].length))
    : `<a href="${href}">${escapeHtml(plain)}</a>`;
  return { text: `${plain}: ${u.url}`, html };
}

/**
 * The body with the signature under it, as text and as simple HTML. With an unsubscribe
 * line it goes where the email says {{unsubscribe}}, otherwise at the very bottom.
 */
export function emailBody(text: string, signature: string, unsubscribe?: UnsubscribeLine | null, preview?: string): { text: string; html: string } {
  const full = signature.trim() ? `${text.trimEnd()}\n\n${signature.trim()}` : text.trimEnd();
  const MARK = "\u0000UNSUB\u0000";
  let body = full.replace(UNSUB_TOKEN, unsubscribe ? MARK : "");
  if (unsubscribe && !body.includes(MARK)) body = `${body}\n\n${MARK}`;
  const u = unsubscribe ? unsubscribeParts(unsubscribe) : null;
  const html = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n")
    .replace(MARK, u ? `<span style="color:#888;font-size:12px">${u.html}</span>` : "");
  const pre = preview?.trim() ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview.trim())}</div>` : "";
  return { text: body.replace(MARK, u?.text ?? "").trim(), html: `${pre}<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${html}</div>` };
}

/** Sends one email. Never throws: a failure comes back as a plain-language reason. */
export async function sendEmail(
  login: MailboxLogin & { provider?: MailboxProviderId },
  mail: OutgoingEmail & { signature?: string; unsubscribe?: UnsubscribeLine | null },
  sender: MailSender = realMailSender,
): Promise<SendResult> {
  try {
    await checkMailHost(login.smtpHost);
    const body = emailBody(mail.text, mail.signature ?? "", mail.unsubscribe, mail.preview);
    const { messageId } = await sender.send(login, { ...mail, ...body });
    return { ok: true, messageId };
  } catch (e) {
    if (e instanceof MailHostError) return { ok: false, error: e.message };
    const err = e as { responseCode?: number; response?: string; command?: string };
    const said = String(err?.response ?? "").replace(/\s+/g, " ").slice(0, 140);
    const aboutRecipient = /RCPT|DATA/i.test(err?.command ?? "RCPT") && !/auth/i.test(said);
    if (err?.responseCode && err.responseCode >= 550 && err.responseCode < 560 && aboutRecipient) {
      return { ok: false, refused: true, error: `The receiving server refused this address. (Server said: ${said})` };
    }
    if (err?.responseCode && err.responseCode >= 450 && err.responseCode < 460 && /RCPT|DATA/i.test(err?.command ?? "")) {
      return { ok: false, temporary: true, error: `The receiving server couldn't take it right now. (Server said: ${said})` };
    }
    return { ok: false, error: explainMailError(e, "SMTP", login.provider) };
  }
}

/** One email through a given SMTP server (the platform's own emails, e.g. password resets). */
export async function sendSystemEmail(
  smtp: { host: string; port: number; user: string; pass: string; from: string },
  mail: { to: string; subject: string; text: string; html: string },
): Promise<void> {
  const t = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port !== 465,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  try {
    await t.sendMail({ from: smtp.from, ...mail });
  } finally {
    t.close();
  }
}
