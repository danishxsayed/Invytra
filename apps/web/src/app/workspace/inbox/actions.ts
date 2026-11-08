"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { emailReplySchema, sendEmailReply, setConversationDone } from "@/lib/email-inbox";
import { MEETING_TAG, sendReply, setDone, setTags } from "@/lib/inbox";
import { parseKey, setEmailMeeting } from "@/lib/unified-inbox";

/* The workspace inbox's actions: each goes through its channel's own checks (channel access, workspace). */

const keyOf = (k: unknown) => {
  const p = parseKey(typeof k === "string" ? k : null);
  if (!p) throw new Error("Unknown conversation");
  return p;
};
const refresh = () => revalidatePath("/", "layout");

export async function replyAction(key: unknown, text: unknown): Promise<Result<unknown>> {
  const k = keyOf(key);
  const body = z.string().max(10_000).parse(text);
  const me = await requireChannel(k.channel);
  if (k.channel === "linkedin") {
    const r = await sendReply(prisma, me.workspace.id, k.id, body);
    refresh();
    return r;
  }
  const p = emailReplySchema.safeParse({ text: body });
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const r = await sendEmailReply(prisma, me.workspace.id, k.id, p.data.text);
  refresh();
  return r;
}

export async function setDoneAction(key: unknown, done: boolean): Promise<Result<unknown>> {
  const k = keyOf(key);
  const me = await requireChannel(k.channel);
  const r = k.channel === "linkedin" ? await setDone(prisma, me.workspace.id, [k.id], done === true) : await setConversationDone(prisma, me.workspace.id, k.id, done === true);
  refresh();
  return r;
}

/** "Meeting booked": the LinkedIn tag, or the email lead's marker. Both count on the overview. */
export async function setMeetingAction(key: unknown, on: boolean): Promise<Result<unknown>> {
  const k = keyOf(key);
  const me = await requireChannel(k.channel);
  if (k.channel === "email") {
    const ok = await setEmailMeeting(prisma, me.workspace.id, k.id, on === true);
    refresh();
    return ok ? { ok: true, value: undefined } : { ok: false, error: "Conversation not found." };
  }
  const c = await prisma.conversation.findFirst({ where: { id: k.id, account: { workspaceId: me.workspace.id } }, select: { tags: true } });
  if (!c) return { ok: false, error: "Conversation not found." };
  const tags = on ? [...new Set([...c.tags, MEETING_TAG])] : c.tags.filter((t) => t.toLowerCase() !== MEETING_TAG.toLowerCase());
  const r = await setTags(prisma, me.workspace.id, k.id, tags);
  refresh();
  return r;
}
