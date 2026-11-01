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
}

export interface MailSender {
  send(login: MailboxLogin, mail: OutgoingEmail & { html: string }): Promise<{ messageId: string }>;
}

/** refused: the receiving server rejected the address itself (a bounce), not our login. */
export type SendResult = { ok: true; messageId: string } | { ok: false; error: string; refused?: boolean };

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
      });
      return { messageId: info.messageId };
    } finally {
      t.close();
    }
  },
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The body with the signature under it, as text and as simple HTML. */
export function emailBody(text: string, signature: string): { text: string; html: string } {
  const full = signature.trim() ? `${text.trimEnd()}\n\n${signature.trim()}` : text.trimEnd();
  const html = full
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return { text: full, html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${html}</div>` };
}

/** Sends one email. Never throws: a failure comes back as a plain-language reason. */
export async function sendEmail(
  login: MailboxLogin & { provider?: MailboxProviderId },
  mail: OutgoingEmail & { signature?: string },
  sender: MailSender = realMailSender,
): Promise<SendResult> {
  try {
    await checkMailHost(login.smtpHost);
    const body = emailBody(mail.text, mail.signature ?? "");
    const { messageId } = await sender.send(login, { ...mail, ...body });
    return { ok: true, messageId };
  } catch (e) {
    if (e instanceof MailHostError) return { ok: false, error: e.message };
    const err = e as { responseCode?: number; response?: string };
    if (err?.responseCode && err.responseCode >= 550 && err.responseCode < 560 && !/auth/i.test(String(err.response))) {
      return { ok: false, refused: true, error: `The receiving server refused this address. (Server said: ${String(err.response ?? "").replace(/\s+/g, " ").slice(0, 140)})` };
    }
    return { ok: false, error: explainMailError(e, "SMTP", login.provider) };
  }
}
