import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@invytra/db";
import { z } from "zod";
import type { Result } from "./accounts";
import { hubOrigin } from "./domains";
import { MIN_PASSWORD_LENGTH, hashPassword } from "./password";
import type { PlatformMailer } from "./platform-mail";
import { emailBrandHeader } from "./welcome-email";

/*
 * Forgot password: a one-use link, valid for an hour, emailed to the account's address.
 * Only a hash of the token is stored. The answer never says whether an account exists.
 * A new password signs the account out everywhere.
 */

export const RESET_VALID_MINUTES = 60;
const MAX_PER_HOUR = 3;

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
export const newPasswordSchema = z
  .object({ password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

const appOrigin = () => (hubOrigin() || process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

/** Emails a reset link if the address has an account (at most 3 an hour). Silent either way. */
export async function requestPasswordReset(prisma: PrismaClient, emailRaw: string, send: PlatformMailer, now = new Date()): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) return;
  const recent = await prisma.passwordReset.count({ where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } });
  if (recent >= MAX_PER_HOUR) return;
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha(token), expiresAt: new Date(now.getTime() + RESET_VALID_MINUTES * 60_000), createdAt: now } });
  const link = `${appOrigin()}/reset-password?token=${token}`;
  const first = user.name.split(" ")[0] || "there";
  await send({
    to: email,
    subject: "Reset your Invytra password",
    text: `Hi ${first},\n\nSomeone (hopefully you) asked to reset the password of your Invytra account. Choose a new one here:\n\n${link}\n\nThe link works once, for ${RESET_VALID_MINUTES} minutes. If you didn't ask, ignore this email: your password stays the same.\n\nInvytra`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1917">${emailBrandHeader(appOrigin())}<p>Hi ${first.replace(/[<>&"]/g, "")},</p><p>Someone (hopefully you) asked to reset the password of your Invytra account.</p><p><a href="${link}" style="display:inline-block;background:#c6f432;color:#1c1917;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p><p style="color:#78716c;font-size:13px">The link works once, for ${RESET_VALID_MINUTES} minutes. If you didn't ask, ignore this email: your password stays the same.</p></div>`,
  });
}

/** Whether a link still works (for showing the form or "this link expired"). */
export async function resetTokenValid(prisma: PrismaClient, token: string, now = new Date()): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const r = await prisma.passwordReset.findUnique({ where: { tokenHash: sha(token) } });
  return !!r && !r.usedAt && r.expiresAt > now;
}

/** Sets the new password with a valid link; every other link and every session stops working. */
export async function resetPassword(prisma: PrismaClient, token: string, password: string, now = new Date()): Promise<Result<{ userId: string }>> {
  const r = token && token.length <= 100 ? await prisma.passwordReset.findUnique({ where: { tokenHash: sha(token) } }) : null;
  if (!r || r.usedAt || r.expiresAt <= now) return { ok: false, error: "This link has expired or was already used. Ask for a new one." };
  const passwordHash = await hashPassword(password);
  // Claim the link first, so two tabs can't both use it.
  const claimed = await prisma.passwordReset.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: now } });
  if (!claimed.count) return { ok: false, error: "This link was already used. Ask for a new one." };
  await prisma.$transaction([
    prisma.user.update({ where: { id: r.userId }, data: { passwordHash, sessionsValidAfter: now } }),
    prisma.passwordReset.updateMany({ where: { userId: r.userId, usedAt: null }, data: { usedAt: now } }),
  ]);
  return { ok: true, value: { userId: r.userId } };
}

/** For the `pnpm user:password` command: sets a password directly and signs the account out everywhere. */
export async function setPasswordByEmail(prisma: PrismaClient, emailRaw: string, password: string, now = new Date()): Promise<Result> {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  const r = await prisma.user.updateMany({ where: { email: emailRaw.trim().toLowerCase() }, data: { passwordHash: await hashPassword(password), sessionsValidAfter: now } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "No account with that email." };
}
