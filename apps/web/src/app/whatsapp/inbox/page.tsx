import { prisma } from "@invytra/db";
import { prettyPhone } from "@invytra/shared";
import { redirect } from "next/navigation";
import { InboxApp, type OpenChat } from "@/components/whatsapp/inbox/InboxApp";
import type { ListState } from "@/components/whatsapp/inbox/ChatList";
import { requireChannel } from "@/lib/auth";
import { getNumber } from "@/lib/whatsapp";
import { getWaContactDetail } from "@/lib/whatsapp-contact-detail";
import { getChat, inboxCounts, inboxMembers, listChats } from "@/lib/whatsapp-inbox";
import { listSavedReplies, markChatRead } from "@/lib/whatsapp-inbox-send";

export const metadata = { title: "WhatsApp inbox" };
export const dynamic = "force-dynamic";

type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).slice(0, 50);
const pick = <T extends string>(v: string, ok: readonly T[]): T | "" => ((ok as readonly string[]).includes(v) ? (v as T) : "");

export default async function WhatsappInboxPage({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireChannel("whatsapp");
  const ws = me.workspace.id;
  if (!(await getNumber(prisma, ws))) redirect("/whatsapp/number");
  const sp = await searchParams;
  const state: ListState = {
    tab: pick(one(sp.tab), ["unread", "priority"] as const) || "all",
    assigned: one(sp.as).slice(0, 40),
    q: one(sp.q).slice(0, 100),
    sort: one(sp.sort) === "old" ? "old" : "new",
    campaigns: many(sp.camp),
    tags: many(sp.tag),
    window: pick(one(sp.win), ["open", "closed"] as const),
    reply: pick(one(sp.rep), ["needs", "replied"] as const),
    read: pick(one(sp.read), ["read", "unread"] as const),
    since: pick(one(sp.since), ["today", "7d", "30d"] as const),
  };
  const query = { ...state, window: state.window || undefined, reply: state.reply || undefined, read: state.read || undefined, since: state.since || undefined };
  const openId = one(sp.c).slice(0, 40) || null;
  if (openId) await markChatRead(prisma, ws, openId);
  const [chats, counts, members, chat, detail, templates, saved, tags] = await Promise.all([
    listChats(prisma, ws, me.user.id, query),
    inboxCounts(prisma, ws, me.user.id, query),
    inboxMembers(prisma, ws),
    openId ? getChat(prisma, ws, openId) : null,
    openId ? getWaContactDetail(prisma, ws, openId) : null,
    prisma.whatsappTemplate.findMany({ where: { workspaceId: ws, status: "APPROVED", category: { not: "AUTHENTICATION" } }, orderBy: { name: "asc" }, select: { id: true, name: true, language: true, category: true, components: true } }),
    listSavedReplies(prisma, ws),
    prisma.$queryRaw<{ tag: string }[]>`SELECT DISTINCT unnest(tags) AS tag FROM whatsapp_contacts WHERE workspace_id = ${ws} ORDER BY 1 LIMIT 300`,
  ]);
  const open: OpenChat | null =
    chat && detail
      ? {
          id: chat.contact.id,
          name: chat.name,
          firstName: chat.contact.firstName ?? chat.contact.profileName?.split(" ")[0] ?? "",
          phone: prettyPhone(chat.contact.phone),
          starred: chat.contact.starred,
          assignedTo: chat.contact.assignedTo,
          done: !!chat.contact.chatDoneAt,
          optedOut: !!chat.contact.optedOutAt,
          createdAt: chat.contact.createdAt.toISOString(),
          windowEnds: chat.windowEnds,
          messages: chat.messages,
          notes: chat.notes,
          detail,
        }
      : null;
  return <InboxApp chats={chats} counts={counts} state={state} members={members} me={me.user.id} chat={open} templates={templates} saved={saved} knownTags={tags.map((t) => t.tag)} />;
}
