import type { PrismaClient } from "@prisma/client";

/*
 * Bounces. Hard (the address doesn't exist): the lead stops, the contact is marked and the
 * address goes on the suppression list, so no campaign emails it again. Soft (mailbox full,
 * server busy): the same email is tried again later, up to the campaign's limit.
 */


export async function hardBounce(prisma: PrismaClient, leadId: string, reason: string, now = new Date()): Promise<void> {
  const lead = await prisma.emailLead.findUnique({ where: { id: leadId }, select: { workspaceId: true, email: true } });
  if (!lead) return;
  const { workspaceId, email } = lead;
  const why = reason.slice(0, 300);
  await prisma.$transaction([
    prisma.emailLead.update({ where: { id: leadId }, data: { status: "BOUNCED", bounceType: "HARD", nextAt: null, reason: `Hard bounce: ${why}` } }),
    // The same address in the workspace's other running campaigns stops too.
    prisma.emailLead.updateMany({ where: { workspaceId, email, id: { not: leadId }, status: "ACTIVE" }, data: { status: "BOUNCED", bounceType: "HARD", nextAt: null, reason: `Hard bounce in another campaign: ${why}` } }),
    prisma.emailContact.updateMany({ where: { workspaceId, email }, data: { bounceStatus: "HARD", bounceReason: why, lastBounceAt: now } }),
    prisma.emailSuppression.upsert({ where: { workspaceId_email: { workspaceId, email } }, create: { workspaceId, email, reason: "HARD_BOUNCE", detail: why }, update: {} }),
  ]);
}

/**
 * A soft bounce of email `step` (0 = first): retried after `retryHours`, up to `retries` times;
 * after that the lead stops (the address isn't suppressed: it may work again later).
 * Returns whether it will be retried.
 */
export async function softBounce(prisma: PrismaClient, leadId: string, step: number, reason: string, rules: { retries: number; retryHours: number }, now = new Date()): Promise<boolean> {
  const lead = await prisma.emailLead.findUnique({ where: { id: leadId }, select: { workspaceId: true, email: true, softBounces: true, status: true } });
  if (!lead || (lead.status !== "ACTIVE" && lead.status !== "COMPLETED")) return false;
  const count = lead.softBounces + 1;
  const why = reason.slice(0, 300);
  await prisma.emailContact.updateMany({
    where: { workspaceId: lead.workspaceId, email: lead.email, bounceStatus: { not: "HARD" } },
    data: { bounceStatus: "SOFT", softBounces: { increment: 1 }, bounceReason: why, lastBounceAt: now },
  });
  if (count > rules.retries) {
    await prisma.emailLead.update({ where: { id: leadId }, data: { status: "BOUNCED", bounceType: "SOFT", softBounces: count, nextAt: null, reason: `Soft bounce ${count} times: ${why}` } });
    return false;
  }
  await prisma.emailLead.update({
    where: { id: leadId },
    data: { status: "ACTIVE", stepIndex: step, softBounces: count, nextAt: new Date(now.getTime() + rules.retryHours * 3_600_000), reason: `Soft bounce (${count} of ${rules.retries} retries): ${why}` },
  });
  return true;
}
