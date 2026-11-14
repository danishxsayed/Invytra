import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@invytra/db";
import { z } from "zod";
import type { Result } from "./accounts";
import { hubOrigin } from "./domains";
import { MIN_PASSWORD_LENGTH, hashPassword } from "./password";
import type { PlatformMailer } from "./platform-mail";
import { emailBrandHeader } from "./welcome-email";

/*
 * Team: the workspace owner invites teammates by email. The emailed link (valid 7 days, one
 * use; only its hash is stored) lets the teammate create their account straight into this
 * workspace (no trial of their own). The owner sees pending invites, resends or cancels
 * them, and removes members. Every plan has unlimited teammates.
 */

export const INVITE_DAYS = 7;
const MAX_PENDING = 50;
const MAX_SENT_PER_HOUR = 20;
const DAY = 86_400_000;

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const appOrigin = () => (hubOrigin() || process.env.WEB_ORIGIN?.split(",")[0] || "http://localhost:3000").replace(/\/$/, "");
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const inviteEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
export const acceptSchema = z.object({
  token: z.string().min(10).max(100),
  name: z.string().trim().min(1, "Enter your name.").max(80),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
});

const pendingWhere = (now: Date) => ({ acceptedAt: null, revokedAt: null, expiresAt: { gt: now } });

/** The invitation email. */
export function inviteEmail(p: { to: string; inviter: string; workspace: string; link: string }) {
  const text = [
    "Hi,",
    "",
    `${p.inviter} invited you to join the "${p.workspace}" workspace on Invytra, where your team runs outreach on LinkedIn, email and WhatsApp together.`,
    "",
    `Accept the invitation and create your account: ${p.link}`,
    "",
    `The link works for ${INVITE_DAYS} days. If you weren't expecting this, you can ignore this email.`,
    "",
    "Invytra",
  ].join("\n");
  const html = `<div style="background:#f5f5f4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;color:#1c1917;font-size:15px;line-height:1.6">
${emailBrandHeader(appOrigin())}
<p style="margin:0 0 12px;font-size:21px;font-weight:700">Join ${esc(p.workspace)} on Invytra</p>
<p style="margin:0 0 20px;color:#44403c"><strong>${esc(p.inviter)}</strong> invited you to their workspace, where your team runs outreach on LinkedIn, email and WhatsApp together.</p>
<p style="margin:24px 0"><a href="${p.link}" style="display:inline-block;background:#1c1917;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Accept the invitation</a></p>
<p style="margin:0;color:#78716c;font-size:13px">The link works for ${INVITE_DAYS} days. If you weren't expecting this, you can ignore this email.</p>
</div></div>`;
  return { to: p.to, subject: `${p.inviter} invited you to ${p.workspace} on Invytra`, text, html };
}

/** Invites someone (or sends a fresh link if they're already invited). Owner only (the caller checks). */
export async function inviteMember(
  prisma: PrismaClient,
  workspaceId: string,
  inviter: { id: string; name: string },
  emailRaw: string,
  send: PlatformMailer | null,
  now = new Date(),
): Promise<Result<{ resent: boolean }>> {
  const parsed = inviteEmailSchema.safeParse(emailRaw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const email = parsed.data;
  if (!send) return { ok: false, error: "Emails can't be sent from this server yet, so invitations can't go out. Ask the Invytra team." };
  const existing = await prisma.user.findUnique({ where: { email }, include: { memberships: { select: { workspaceId: true } } } });
  if (existing?.memberships.some((m) => m.workspaceId === workspaceId)) return { ok: false, error: "They're already in this workspace." };
  if (existing) return { ok: false, error: "This email already has its own Invytra account. Invite another address of theirs (for now, an account belongs to one workspace)." };
  const sentLastHour = await prisma.workspaceInvite.count({ where: { workspaceId, sentAt: { gte: new Date(now.getTime() - 3_600_000) } } });
  if (sentLastHour >= MAX_SENT_PER_HOUR) return { ok: false, error: "That's a lot of invitations at once. Try again in an hour." };
  const pending = await prisma.workspaceInvite.findFirst({ where: { workspaceId, email, ...pendingWhere(now) } });
  if (!pending && (await prisma.workspaceInvite.count({ where: { workspaceId, ...pendingWhere(now) } })) >= MAX_PENDING)
    return { ok: false, error: `You have ${MAX_PENDING} invitations waiting. Cancel some first.` };

  const token = randomBytes(32).toString("base64url");
  const data = { tokenHash: sha(token), expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY), sentAt: now, invitedById: inviter.id };
  const invite = pending ? await prisma.workspaceInvite.update({ where: { id: pending.id }, data }) : await prisma.workspaceInvite.create({ data: { workspaceId, email, ...data, createdAt: now } });
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } });
  try {
    await send(inviteEmail({ to: email, inviter: inviter.name, workspace: ws.name, link: `${appOrigin()}/invite?token=${token}` }));
  } catch (e) {
    if (!pending) await prisma.workspaceInvite.delete({ where: { id: invite.id } });
    console.error("Invite email not sent:", e instanceof Error ? e.message : e);
    return { ok: false, error: "The invitation email couldn't be sent. Please try again." };
  }
  return { ok: true, value: { resent: !!pending } };
}

export async function listInvites(prisma: PrismaClient, workspaceId: string, now = new Date()) {
  return prisma.workspaceInvite.findMany({ where: { workspaceId, ...pendingWhere(now) }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, sentAt: true, expiresAt: true } });
}

export async function cancelInvite(prisma: PrismaClient, workspaceId: string, inviteId: string, now = new Date()): Promise<Result> {
  const r = await prisma.workspaceInvite.updateMany({ where: { id: inviteId, workspaceId, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "That invitation is already gone." };
}

/** What the invitation link shows (null: expired, used, cancelled or unknown). */
export async function inviteInfo(prisma: PrismaClient, token: string, now = new Date()) {
  if (!token || token.length > 100) return null;
  const i = await prisma.workspaceInvite.findUnique({ where: { tokenHash: sha(token) }, include: { workspace: { select: { name: true } } } });
  if (!i || i.acceptedAt || i.revokedAt || i.expiresAt <= now) return null;
  const inviter = i.invitedById ? await prisma.user.findUnique({ where: { id: i.invitedById }, select: { name: true } }) : null;
  return { email: i.email, workspace: i.workspace.name, inviter: inviter?.name ?? "Your teammate" };
}

/** Creates the teammate's account in the workspace; the link then stops working. */
export async function acceptInvite(prisma: PrismaClient, input: unknown, now = new Date()): Promise<Result<{ userId: string; workspaceId: string }>> {
  const p = acceptSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const i = await prisma.workspaceInvite.findUnique({ where: { tokenHash: sha(p.data.token) } });
  if (!i || i.acceptedAt || i.revokedAt || i.expiresAt <= now) return { ok: false, error: "This invitation has expired or was already used. Ask for a new one." };
  if (await prisma.user.findUnique({ where: { email: i.email }, select: { id: true } })) return { ok: false, error: "This email already has an Invytra account. Log in instead." };
  const passwordHash = await hashPassword(p.data.password);
  try {
    return await prisma.$transaction(async (tx) => {
      // Claim the link first, so two tabs can't both use it.
      const claimed = await tx.workspaceInvite.updateMany({ where: { id: i.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: now } });
      if (!claimed.count) throw new Error("used");
      const user = await tx.user.create({ data: { email: i.email, name: p.data.name, passwordHash, lastLoginAt: now, onboardedAt: now } }); // The owner answered the setup questions already.
      await tx.membership.create({ data: { userId: user.id, workspaceId: i.workspaceId, role: i.role } });
      return { ok: true as const, value: { userId: user.id, workspaceId: i.workspaceId } };
    });
  } catch {
    return { ok: false, error: "This invitation was already used. Log in instead." };
  }
}

/** Removes a teammate (owner only, never the owner). Their account goes too if it has no other workspace. */
export async function removeMember(prisma: PrismaClient, workspaceId: string, actorId: string, userId: string): Promise<Result> {
  if (userId === actorId) return { ok: false, error: "You can't remove yourself." };
  const m = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!m) return { ok: false, error: "They're not in this workspace any more." };
  if (m.role === "OWNER") return { ok: false, error: "The workspace owner can't be removed." };
  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { userId_workspaceId: { userId, workspaceId } } });
    if (!(await tx.membership.count({ where: { userId } }))) await tx.user.delete({ where: { id: userId } });
  });
  return { ok: true, value: undefined };
}
