"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { cancelReply, requestInboxCheck, sendReply, setDone, setLeadPaused, setTags } from "@/lib/inbox";

/* Every action re-reads the signed-in user; ids from the browser are checked against the workspace in lib/inbox. */

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((i) => typeof i === "string");

export async function setDoneAction(ids: unknown, done: boolean): Promise<Result<number>> {
  const me = await requireUser();
  if (!strings(ids)) return { ok: false, error: "Nothing selected." };
  const r = await setDone(prisma, me.workspace.id, ids, !!done);
  revalidatePath("/app", "layout");
  return r;
}

export async function sendReplyAction(conversationId: unknown, text: unknown): Promise<Result<string>> {
  const me = await requireUser();
  if (typeof conversationId !== "string" || typeof text !== "string") return { ok: false, error: "Write your reply first." };
  const r = await sendReply(prisma, me.workspace.id, conversationId, text);
  revalidatePath("/app/inbox");
  return r;
}

export async function setTagsAction(conversationId: unknown, tags: unknown): Promise<Result<string[]>> {
  const me = await requireUser();
  if (typeof conversationId !== "string" || !strings(tags)) return { ok: false, error: "Couldn't save the tags." };
  const r = await setTags(prisma, me.workspace.id, conversationId, tags);
  revalidatePath("/app/inbox");
  return r;
}

export async function setLeadPausedAction(conversationId: unknown, paused: boolean): Promise<Result> {
  const me = await requireUser();
  if (typeof conversationId !== "string") return { ok: false, error: "Conversation not found." };
  const r = await setLeadPaused(prisma, me.workspace.id, conversationId, !!paused);
  revalidatePath("/app", "layout");
  return r;
}

export async function cancelReplyAction(actionId: unknown): Promise<Result> {
  const me = await requireUser();
  if (typeof actionId !== "string") return { ok: false, error: "Reply not found." };
  const r = await cancelReply(prisma, me.workspace.id, actionId);
  revalidatePath("/app/inbox");
  return r;
}

/** Called every minute while the inbox is open and visible (and by "Check now"). */
export async function requestInboxCheckAction(): Promise<{ lastChecked: string | null; queued: number }> {
  const me = await requireUser();
  const r = await requestInboxCheck(prisma, me.workspace.id);
  return { lastChecked: r.lastChecked?.toISOString() ?? null, queued: r.queued };
}
