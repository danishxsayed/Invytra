import { DEFAULT_WORKSPACE_ID, type PrismaClient } from "@invytra/db";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "./password";

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  company: z.string().trim().min(2, "Enter your company name"),
  email: z.string().trim().toLowerCase().pipe(z.string().email("Enter a valid email address")),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
});
export type SignupInput = z.infer<typeof signupSchema>;

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists. Log in instead.");
  }
}

/**
 * Creates a user and their workspace. The very first user of an installation
 * takes over the "default" workspace, which holds the accounts that were set
 * up from the command line in Phase 0.
 */
export async function registerUser(
  prisma: PrismaClient,
  input: SignupInput,
): Promise<{ userId: string; workspaceId: string }> {
  const passwordHash = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email } })) throw new EmailTakenError();
    const isFirstUser = (await tx.user.count()) === 0;
    const user = await tx.user.create({ data: { email, name: input.name.trim(), passwordHash } });
    const workspace = isFirstUser
      ? await tx.workspace.update({ where: { id: DEFAULT_WORKSPACE_ID }, data: { name: input.company } })
      : await tx.workspace.create({ data: { name: input.company } });
    await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
    return { userId: user.id, workspaceId: workspace.id };
  });
}

/** Returns the user's id and first workspace if the email/password match, else null. */
export async function checkLogin(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<{ userId: string; workspaceId: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const ok = await verifyPassword(password, user?.passwordHash);
  const membership = user?.memberships[0];
  if (!ok || !user || !membership) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { userId: user.id, workspaceId: membership.workspaceId };
}
