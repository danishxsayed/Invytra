"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
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
  const me = await requireUser();
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
  const me = await requireUser();
  if (to !== "ACTIVE" && to !== "PAUSED") return { ok: false, error: "Unknown status." };
  const r = await guarded(() => setCampaignStatus(prisma, me.workspace.id, String(id), to));
  if (r.ok) refresh(id);
  return r;
}

export async function deleteCampaignAction(id: string): Promise<Result> {
  const me = await requireUser();
  const r = await guarded(() => deleteCampaign(prisma, me.workspace.id, String(id)));
  if (r.ok) refresh();
  return r;
}
