"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { audienceCount, changeWaCampaign, createWaCampaign } from "@/lib/whatsapp-campaigns";

/* WhatsApp campaigns: each action checks the WhatsApp channel and only touches the user's workspace. */

export async function audienceAction(tags: string[], segmentId?: string) {
  const me = await requireChannel("whatsapp");
  return audienceCount(prisma, me.workspace.id, Array.isArray(tags) ? tags.map(String).slice(0, 50) : [], typeof segmentId === "string" ? segmentId.slice(0, 40) : "");
}

export async function createWaCampaignAction(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireChannel("whatsapp");
  const r = await createWaCampaign(prisma, me.workspace.id, me.user.name, input);
  revalidatePath("/whatsapp/campaigns");
  return r;
}

export async function changeWaCampaignAction(id: string, to: "pause" | "resume" | "cancel"): Promise<Result> {
  const me = await requireChannel("whatsapp");
  if (!["pause", "resume", "cancel"].includes(to)) return { ok: false, error: "Unknown action." };
  const r = await changeWaCampaign(prisma, me.workspace.id, String(id), to);
  revalidatePath("/whatsapp/campaigns", "layout");
  return r;
}
