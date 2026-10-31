"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { previewAiLines, type AiPreviewLine } from "@/lib/ai-preview";
import { aiSettingsSchema } from "@invytra/shared";
import {
  CampaignNotFoundError,
  campaignInputSchema,
  createCampaign,
  deleteCampaign,
  setCampaignStatus,
  updateCampaign,
} from "@/lib/campaigns";

/* Every action re-reads the signed-in user; ids from the browser are checked in lib/campaigns. */

async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CampaignNotFoundError) return { ok: false, error: e.message };
    throw e;
  }
}

const refresh = (id?: string) => {
  revalidatePath("/app", "layout");
  if (id) revalidatePath(`/app/campaigns/${id}`);
};

/**
 * Saves the builder (new or existing campaign). With `launch`, also starts it.
 * If launching isn't possible yet, the draft is still saved and `launchError` says why.
 */
export async function saveCampaignAction(
  id: string | null,
  input: unknown,
  launch: boolean,
): Promise<Result<{ id: string; launchError?: string }>> {
  const me = await requireChannel("linkedin");
  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  return guarded(async () => {
    let campaignId = id ? String(id) : null;
    if (campaignId) {
      const r = await updateCampaign(prisma, me.workspace.id, campaignId, parsed.data);
      if (!r.ok) return r;
    } else {
      const r = await createCampaign(prisma, me.workspace.id, parsed.data);
      if (!r.ok) return r;
      campaignId = r.value;
    }
    let launchError: string | undefined;
    if (launch) {
      const r = await setCampaignStatus(prisma, me.workspace.id, campaignId, "ACTIVE");
      if (!r.ok) launchError = r.error;
    }
    refresh(campaignId);
    return { ok: true, value: { id: campaignId, ...(launchError && { launchError }) } };
  });
}

export async function setCampaignStatusAction(id: string, to: "ACTIVE" | "PAUSED"): Promise<Result> {
  const me = await requireChannel("linkedin");
  if (to !== "ACTIVE" && to !== "PAUSED") return { ok: false, error: "Unknown status." };
  const r = await guarded(() => setCampaignStatus(prisma, me.workspace.id, String(id), to));
  if (r.ok) refresh(id);
  return r;
}

export async function deleteCampaignAction(id: string): Promise<Result> {
  const me = await requireChannel("linkedin");
  const r = await guarded(() => deleteCampaign(prisma, me.workspace.id, String(id)));
  if (r.ok) refresh();
  return r;
}

/** AI lines for the first few people of the list (the launch preview). */
export async function previewAiLinesAction(input: {
  listId: string;
  accountIds: string[];
  ai: unknown;
  template: string;
  limit: number;
}): Promise<Result<AiPreviewLine[]>> {
  const me = await requireChannel("linkedin");
  const ai = aiSettingsSchema.safeParse(input?.ai);
  if (!ai.success || typeof input.listId !== "string" || !Array.isArray(input.accountIds)) return { ok: false, error: "Couldn't preview the AI lines." };
  return previewAiLines(prisma, me.workspace.id, {
    listId: input.listId,
    accountIds: input.accountIds.filter((x): x is string => typeof x === "string"),
    ai: ai.data,
    template: String(input.template ?? "").slice(0, 2000),
    limit: Math.min(2000, Math.max(100, Number(input.limit) || 300)),
  });
}

