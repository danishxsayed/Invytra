"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { emailReplySchema, requestEmailCheck, sendEmailReply, setConversationDone } from "@/lib/email-inbox";

/* Email inbox actions: Email channel only, and only the signed-in workspace's conversations. */

const ws = async () => (await requireChannel("email")).workspace.id;

export async function sendEmailReplyAction(leadId: string, input: unknown): Promise<Result> {
  const w = await ws();
  const p = emailReplySchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const r = await sendEmailReply(prisma, w, String(leadId), p.data.text);
  revalidatePath("/email", "layout");
  return r;
}

export async function setConversationDoneAction(leadId: string, done: boolean): Promise<Result> {
  const r = await setConversationDone(prisma, await ws(), String(leadId), done === true);
  revalidatePath("/email", "layout");
  return r;
}

export async function checkEmailNowAction(): Promise<void> {
  await requestEmailCheck(prisma, await ws());
}
