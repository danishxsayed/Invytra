import { messageKeys, type PrismaClient } from "@invytra/db";
import { nameKey } from "@invytra/shared";
import { isOwnMessage, snippetBody, type InboxThread, type ThreadMessage } from "../linkedin/inbox.js";
import { parseThreadTime } from "../linkedin/thread-time.js";

/*
 * Conversations for the dashboard inbox: one row per account + person, with
 * their messages. Read from LinkedIn on each inbox check (opened chats give the
 * full back-and-forth; the rest give their latest snippet) and from replies
 * sent in Invytra.
 */

export { messageKeys, recordReply } from "@invytra/db";

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

async function leadsByName(prisma: PrismaClient, accountId: string): Promise<Map<string, string>> {
  const leads = await prisma.campaignLead.findMany({
    where: { accountId },
    select: { id: true, linkedinName: true, firstName: true, lastName: true },
    orderBy: { updatedAt: "asc" },
  });
  const byName = new Map<string, string>();
  for (const l of leads) {
    for (const n of [l.linkedinName, [l.firstName, l.lastName].filter(Boolean).join(" ")]) {
      const k = nameKey(n);
      if (k) byName.set(k, l.id); // the most recently active lead wins
    }
  }
  return byName;
}

/** Saves messages (oldest first). Known ones get their time corrected when LinkedIn's label can be read. */
async function saveMessages(
  prisma: PrismaClient,
  conversationId: string,
  msgs: (Pick<ThreadMessage, "fromMe" | "text"> & Partial<Pick<ThreadMessage, "dateLabel" | "timeLabel">>)[],
  now: Date,
  timeZone: string,
): Promise<Date | null> {
  const keys = messageKeys(msgs);
  let last: Date | null = null;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]!;
    const text = m.text.trim();
    if (!text) continue;
    const parsed = m.timeLabel ? parseThreadTime(m.dateLabel ?? "", m.timeLabel, now, timeZone) : null;
    // Keep the order LinkedIn showed, even for messages sent in the same minute.
    const sentAt = parsed ? new Date(parsed.getTime() + i) : new Date(now.getTime() - (msgs.length - i));
    const label = [m.dateLabel, m.timeLabel].filter(Boolean).join(" · ") || null;
    await prisma.conversationMessage.upsert({
      where: { conversationId_key: { conversationId, key: keys[i]! } },
      create: { conversationId, fromMe: m.fromMe, text, timeLabel: label, sentAt, key: keys[i]! },
      update: parsed ? { sentAt, timeLabel: label } : {},
    });
    last = parsed ?? last;
  }
  return last;
}

/** Stores one inbox check's conversations. Returns how many changed. */
export async function storeConversations(
  prisma: PrismaClient,
  accountId: string,
  threads: InboxThread[],
  timeZone: string,
  now = new Date(),
): Promise<number> {
  if (threads.length === 0) return 0;
  const existing = new Map(
    (await prisma.conversation.findMany({ where: { accountId, participantName: { in: threads.map((t) => t.name) } } })).map((c) => [c.participantName, c]),
  );
  const byName = await leadsByName(prisma, accountId);
  let changed = 0;
  for (const t of threads) {
    if (!t.name) continue;
    const ex = existing.get(t.name);
    const isNew = !ex || ex.lastSnippetKey !== t.messageKey;
    const own = isOwnMessage(t.snippet);
    const body = snippetBody(t.name, t.snippet);
    const read = t.messages?.filter((m) => m.text.trim()) ?? [];
    const latest = read.at(-1);
    const lastFromMe = latest ? latest.fromMe : own;
    const fields = {
      unread: t.unread,
      lastSnippetKey: t.messageKey,
      ...(t.externalId && { externalId: t.externalId }),
      campaignLeadId: ex?.campaignLeadId ?? byName.get(nameKey(t.name)) ?? null,
      ...(isNew && {
        lastMessageText: latest ? norm(latest.text) : body,
        lastFromMe,
        lastMessageAt: now,
        // They wrote again: it needs a reply, even if it was marked done before.
        ...(!lastFromMe && { doneAt: null }),
      }),
    };
    const conv = await prisma.conversation.upsert({
      where: { accountId_participantName: { accountId, participantName: t.name } },
      create: { accountId, participantName: t.name, ...fields, lastMessageText: fields.lastMessageText ?? body, lastFromMe },
      update: fields,
    });
    if (isNew) changed++;
    let at: Date | null = null;
    if (read.length) at = await saveMessages(prisma, conv.id, read, now, timeZone);
    else if (isNew && body) await saveMessages(prisma, conv.id, [{ fromMe: own, text: body }], now, timeZone);
    if (at && isNew) await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: at } });
  }
  return changed;
}
