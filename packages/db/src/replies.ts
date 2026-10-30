import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/*
 * Shared by the worker (storing inbox checks) and the dashboard (replies sent straight
 * through Unipile), so a message is stored once whichever side sees it first.
 */

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

/** The same message read twice gets the same key: side + text + which repeat of that text it is. */
export function messageKeys(msgs: { fromMe: boolean; text: string }[]): string[] {
  const seen = new Map<string, number>();
  return msgs.map((m) => {
    const base = `${m.fromMe ? 1 : 0}|${norm(m.text)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash("md5").update(`${base}|${n}`).digest("hex");
  });
}

/** A reply sent from Invytra: show it in the conversation straight away. */
export async function recordReply(prisma: PrismaClient, conversationId: string, text: string, now = new Date()): Promise<void> {
  const mine = await prisma.conversationMessage.findMany({ where: { conversationId, fromMe: true }, select: { text: true }, orderBy: { sentAt: "asc" } });
  const keys = messageKeys([...mine.map((m) => ({ fromMe: true, text: m.text })), { fromMe: true, text }]);
  await prisma.conversationMessage.upsert({
    where: { conversationId_key: { conversationId, key: keys.at(-1)! } },
    create: { conversationId, fromMe: true, text: text.trim(), sentAt: now, key: keys.at(-1)! },
    update: {},
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastFromMe: true, unread: false, lastMessageText: norm(text), lastMessageAt: now } });
}
