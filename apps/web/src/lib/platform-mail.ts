import { sendSystemEmail } from "@invytra/db";

/*
 * Emails Invytra itself sends (password resets…), from the platform's own mailbox:
 * PLATFORM_SMTP_HOST / _PORT / _USER / _PASS and PLATFORM_EMAIL_FROM in .env.
 */

export interface PlatformEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export type PlatformMailer = (mail: PlatformEmail) => Promise<void>;

export const platformMailConfigured = (env: NodeJS.ProcessEnv = process.env) => !!(env.PLATFORM_SMTP_HOST && env.PLATFORM_SMTP_USER && env.PLATFORM_SMTP_PASS);

export function platformMailer(env: NodeJS.ProcessEnv = process.env): PlatformMailer | null {
  if (!platformMailConfigured(env)) return null;
  const smtp = {
    host: env.PLATFORM_SMTP_HOST!,
    port: Number(env.PLATFORM_SMTP_PORT || 465),
    user: env.PLATFORM_SMTP_USER!,
    pass: env.PLATFORM_SMTP_PASS!,
    from: env.PLATFORM_EMAIL_FROM || `Invytra <${env.PLATFORM_SMTP_USER}>`,
  };
  return (mail) => sendSystemEmail(smtp, mail);
}
