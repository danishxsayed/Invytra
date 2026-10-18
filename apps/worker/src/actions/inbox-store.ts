import type { PrismaClient } from "@invytra/db";
import { isOwnMessage, type InboxThread } from "../linkedin/actions.js";

/** Stores replies from an inbox sync. Returns how many were new. */
export async function storeInboxThreads(
  prisma: PrismaClient,
  accountId: string,
  threads: InboxThread[],
): Promise<number> {
  const replies = threads.filter((t) => t.snippet && !isOwnMessage(t.snippet));
  if (replies.length === 0) return 0;
  const res = await prisma.inboxMessage.createMany({
    data: replies.map((t) => ({
      accountId,
      linkedinMessageId: t.messageKey,
      fromName: t.name || "(unknown)",
      fromProfileUrl: null,
      text: t.snippet,
      sentAt: new Date(),
    })),
    skipDuplicates: true,
  });
  return res.count;
}
