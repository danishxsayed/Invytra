import type { PrismaClient } from "@invytra/db";
import { z } from "zod";
import type { Result } from "./accounts";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "./password";

/* Profile, password, workspace and team. All scoped to the signed-in user / workspace. */

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80, "Keep your name under 80 characters"),
  email: z.string().trim().toLowerCase().pipe(z.string().email("Enter a valid email address")),
  /** Needed only when the email changes. */
  currentPassword: z.string().max(200).optional().default(""),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(200),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: "The new passwords don't match", path: ["confirm"] });

export const workspaceSchema = z.object({ name: z.string().trim().min(2, "Enter your company name").max(80, "Keep it under 80 characters") });

/** Whole seconds, so a session signed in this same second still counts as "after". */
const cutoffNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export async function updateProfile(prisma: PrismaClient, userId: string, input: z.infer<typeof profileSchema>): Promise<Result> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (input.email !== user.email) {
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) return { ok: false, error: "Enter your current password to change your email." };
    if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) return { ok: false, error: "Another account already uses that email." };
  }
  await prisma.user.update({ where: { id: userId }, data: { name: input.name, email: input.email } });
  return { ok: true, value: undefined };
}

/** Changes the password and signs out every other session. The caller re-issues this browser's session. */
export async function changePassword(prisma: PrismaClient, userId: string, input: z.infer<typeof passwordSchema>): Promise<Result> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) return { ok: false, error: "Your current password isn't right." };
  if (input.newPassword === input.currentPassword) return { ok: false, error: "Choose a password you haven't used here before." };
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword), sessionsValidAfter: cutoffNow() } });
  return { ok: true, value: undefined };
}

export async function signOutEverywhere(prisma: PrismaClient, userId: string): Promise<Result> {
  await prisma.user.update({ where: { id: userId }, data: { sessionsValidAfter: cutoffNow() } });
  return { ok: true, value: undefined };
}

export async function renameWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  role: string,
  input: z.infer<typeof workspaceSchema>,
): Promise<Result> {
  if (role !== "OWNER") return { ok: false, error: "Only the workspace owner can change this." };
  await prisma.workspace.update({ where: { id: workspaceId }, data: { name: input.name } });
  return { ok: true, value: undefined };
}

export async function teamMembers(prisma: PrismaClient, workspaceId: string) {
  return prisma.membership.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
  });
}
