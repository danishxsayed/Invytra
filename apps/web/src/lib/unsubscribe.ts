import { readUnsubscribeToken, unsubscribeLead, type PrismaClient } from "@invytra/db";

/* The public unsubscribe flow: who a link is for, and unsubscribing them. No sign-in. */

const key = () => {
  const k = process.env.SESSION_ENCRYPTION_KEY;
  if (!k) throw new Error("SESSION_ENCRYPTION_KEY is missing from .env");
  return k;
};

/** The sender's name and whether this person is already unsubscribed (null: not a valid link). */
export async function unsubscribeInfo(prisma: PrismaClient, token: string) {
  const id = readUnsubscribeToken(token, key());
  if (!id) return null;
  const lead = await prisma.emailLead.findUnique({ where: { id }, include: { emailAccount: { select: { fromName: true, email: true } }, contact: { select: { subscribed: true } } } });
  if (!lead) return null;
  const done = lead.status === "UNSUBSCRIBED" || lead.contact?.subscribed === false || !!(await prisma.emailSuppression.findFirst({ where: { workspaceId: lead.workspaceId, email: lead.email, reason: "UNSUBSCRIBED" } }));
  const sender = lead.emailAccount ? `${lead.emailAccount.fromName} (${lead.emailAccount.email.slice(lead.emailAccount.email.indexOf("@") + 1)})` : "this sender";
  return { email: lead.email, sender, done };
}

export async function unsubscribeByToken(prisma: PrismaClient, token: string, how: string): Promise<boolean> {
  const id = readUnsubscribeToken(token, key());
  if (!id) return false;
  return !!(await unsubscribeLead(prisma, id, how));
}
