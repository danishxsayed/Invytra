import { hubOrigin } from "./domains";
import { emailBrandHeader } from "@invytra/db";
import type { PlatformEmail, PlatformMailer } from "./platform-mail";

/*
 * The welcome email a new account gets right after signing up: where their workspace is and
 * the three first steps. Sending is best effort: a mail problem never blocks a sign-up.
 */

/** The Invytra logo and name for the top of platform emails. */
export { emailBrandHeader };

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function welcomeEmail(p: { to: string; name: string; workspace: string; origin?: string; replyTo?: string }): PlatformEmail {
  const replyTo = p.replyTo ?? process.env.PLATFORM_EMAIL_REPLY_TO?.trim() ?? "";
  const help = replyTo ? "Questions or stuck anywhere? Just reply to this email." : "";
  const origin = (p.origin ?? (hubOrigin() || process.env.WEB_ORIGIN?.split(",")[0] || "http://localhost:3000")).replace(/\/$/, "");
  const first = p.name.trim().split(/\s+/)[0] || "there";
  const steps = [
    ["Connect a channel", "Add your LinkedIn account or an email mailbox from your workspace."],
    ["Bring in your leads", "Upload a CSV or a Sales Navigator search, or ask Invy to find businesses for you."],
    ["Launch your first campaign", "Write your sequence, choose safe daily limits and start. Invytra paces everything for you."],
  ] as const;
  const text = [
    `Hi ${first},`,
    "",
    `Welcome to Invytra! Your workspace "${p.workspace}" is ready.`,
    "",
    "Three steps to your first replies:",
    ...steps.map(([t, d], i) => `${i + 1}. ${t}: ${d}`),
    "",
    `Open your workspace: ${origin}/`,
    ...(help ? ["", help] : []),
    "",
    "The Invytra team",
  ].join("\n");
  const html = `<div style="background:#f5f5f4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;color:#1c1917;font-size:15px;line-height:1.6">
${emailBrandHeader(origin)}
<p style="margin:0 0 12px;font-size:22px;font-weight:700">Welcome, ${esc(first)}!</p>
<p style="margin:0 0 20px;color:#44403c">Your workspace <strong>${esc(p.workspace)}</strong> is ready. Here's how to get to your first replies:</p>
${steps
  .map(
    ([t, d], i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>
<td valign="top" style="width:28px"><div style="width:22px;height:22px;border-radius:11px;background:#1c1917;color:#ffffff;font-size:12px;font-weight:700;text-align:center;line-height:22px">${i + 1}</div></td>
<td style="padding-left:8px"><strong>${t}</strong><br><span style="color:#57534e">${d}</span></td></tr></table>`,
  )
  .join("\n")}
<p style="margin:24px 0"><a href="${origin}/" style="display:inline-block;background:#1c1917;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Open my workspace</a></p>
${help ? `<p style="margin:0;color:#78716c;font-size:13px">${help}</p>` : ""}
</div>
<p style="max-width:560px;margin:16px auto 0;text-align:center;color:#a8a29e;font-size:12px">You're getting this because you created an Invytra account with ${esc(p.to)}.</p>
</div>`;
  return { to: p.to, subject: `Welcome to Invytra, ${first}!`, text, html, ...(replyTo ? { replyTo } : {}) };
}

/** Sends the welcome email; logs (without the address) and moves on if it fails. */
export async function sendWelcome(send: PlatformMailer | null, p: Parameters<typeof welcomeEmail>[0]): Promise<boolean> {
  if (!send) return false;
  try {
    await send(welcomeEmail(p));
    return true;
  } catch (e) {
    console.error("Welcome email not sent:", e instanceof Error ? e.message : e);
    return false;
  }
}
