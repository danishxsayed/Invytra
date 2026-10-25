import type { PrismaClient } from "@invytra/db";
import { nameKey } from "@invytra/shared";
import { isOwnMessage, type InboxThread } from "../linkedin/actions.js";

/**
 * Stores replies from an inbox read. Returns how many were new.
 * - A conversation whose latest message is ours ("You: …") counts as answered.
 * - New replies are linked to the campaign lead they come from (by name).
 */
export async function storeInboxThreads(
  prisma: PrismaClient,
  accountId: string,
  threads: InboxThread[],
  now = new Date(),
): Promise<number> {
  const ours = threads.filter((t) => t.snippet && isOwnMessage(t.snippet)).map((t) => t.name).filter(Boolean);
  if (ours.length) {
    await prisma.inboxMessage.updateMany({
      where: { accountId, fromName: { in: ours }, answeredAt: null, fetchedAt: { lt: now } },
      data: { answeredAt: now },
    });
  }
  const replies = threads.filter((t) => t.snippet && !isOwnMessage(t.snippet));
  if (replies.length === 0) return 0;
  const res = await prisma.inboxMessage.createMany({
    data: replies.map((t) => ({
      accountId,
      linkedinMessageId: t.messageKey,
      fromName: t.name || "(unknown)",
      fromProfileUrl: null,
      text: t.snippet,
      sentAt: now,
      fetchedAt: now,
    })),
    skipDuplicates: true,
  });
  await linkReplies(prisma, accountId, now);
  return res.count;
}

/** Links recent unlinked replies to this account's campaign leads with the same name (most recently active lead wins). */
export async function linkReplies(prisma: PrismaClient, accountId: string, now = new Date()): Promise<number> {
  const unlinked = await prisma.inboxMessage.findMany({
    where: { accountId, campaignLeadId: null, fetchedAt: { gte: new Date(now.getTime() - 14 * 86400_000) } },
    select: { id: true, fromName: true },
  });
  if (unlinked.length === 0) return 0;
  const leads = await prisma.campaignLead.findMany({
    where: { accountId },
    select: { id: true, linkedinName: true, firstName: true, lastName: true },
    orderBy: { updatedAt: "asc" },
  });
  const byName = new Map<string, string>();
  for (const l of leads) {
    for (const n of [l.linkedinName, [l.firstName, l.lastName].filter(Boolean).join(" ")]) {
      const k = nameKey(n);
      if (k) byName.set(k, l.id); // later (more recently updated) leads overwrite earlier ones
    }
  }
  let linked = 0;
  for (const m of unlinked) {
    const id = byName.get(nameKey(m.fromName));
    if (!id) continue;
    await prisma.inboxMessage.update({ where: { id: m.id }, data: { campaignLeadId: id } });
    linked++;
  }
  return linked;
}
