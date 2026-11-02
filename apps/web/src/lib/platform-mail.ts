import { sendSystemEmail } from "@invytra/db";

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
}
export type PlatformMailer = (mail: PlatformEmail) => Promise<void>;

export const platformMailConfigured = (env: Record<string, string | undefined> = process.env) => !!(env.RESEND_API_KEY || (env.PLATFORM_SMTP_HOST && env.PLATFORM_SMTP_USER && env.PLATFORM_SMTP_PASS));

/** Resend's send-email API: one POST, the key as a bearer token. */
export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): PlatformMailer {
  return async (mail) => {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
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
