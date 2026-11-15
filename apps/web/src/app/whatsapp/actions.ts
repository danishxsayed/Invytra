"use server";

import { prisma } from "@invytra/db";
import type { WaTemplateDraft } from "@invytra/shared";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { canPreview } from "@/lib/preview";
import { senderProblem } from "@/lib/subscriptions";
import { connectNumber, createTemplate, deleteTemplate, disconnectNumber, refreshNumber, saveProfile, saveProfilePhoto, syncTemplates, uploadHeaderMedia } from "@/lib/whatsapp";

/* WhatsApp actions: each checks the signed-in user may use the WhatsApp channel, and only touches their workspace. */

const done = <T,>(r: Result<T>) => {
  revalidatePath("/whatsapp", "layout");
  return r;
};

export async function connectWhatsappAction(input: unknown): Promise<Result<{ id: string; warning?: string }>> {
  const me = await requireChannel("whatsapp");
  if (!canPreview("whatsapp", me.user.email)) {
    const problem = await senderProblem(prisma, me.workspace.id, "whatsapp");
    if (problem) return { ok: false, error: problem };
  }
  return done(await connectNumber(prisma, me.workspace.id, input));
}

export async function refreshNumberAction(): Promise<Result> {
  const me = await requireChannel("whatsapp");
  return done(await refreshNumber(prisma, me.workspace.id));
}

export async function disconnectNumberAction(): Promise<Result> {
  const me = await requireChannel("whatsapp");
  if (me.role !== "OWNER") return { ok: false, error: "Only the workspace owner can disconnect the number." };
  return done(await disconnectNumber(prisma, me.workspace.id));
}

export async function saveProfileAction(input: unknown): Promise<Result> {
  const me = await requireChannel("whatsapp");
  return done(await saveProfile(prisma, me.workspace.id, input));
}

export async function saveProfilePhotoAction(form: FormData): Promise<Result> {
  const me = await requireChannel("whatsapp");
  const file = form.get("file");
  return done(await saveProfilePhoto(prisma, me.workspace.id, file instanceof File ? file : null));
}

export async function syncTemplatesAction(): Promise<Result<{ count: number }>> {
  const me = await requireChannel("whatsapp");
  return done(await syncTemplates(prisma, me.workspace.id));
}

export async function createTemplateAction(draft: WaTemplateDraft): Promise<Result<{ id: string; status: string }>> {
  const me = await requireChannel("whatsapp");
  return done(await createTemplate(prisma, me.workspace.id, draft));
}

export async function deleteTemplateAction(id: string): Promise<Result> {
  const me = await requireChannel("whatsapp");
  return done(await deleteTemplate(prisma, me.workspace.id, String(id)));
}

export async function uploadHeaderMediaAction(form: FormData): Promise<Result<{ handle: string }>> {
  const me = await requireChannel("whatsapp");
  const file = form.get("file");
  return uploadHeaderMedia(prisma, me.workspace.id, String(form.get("kind") ?? ""), file instanceof File ? file : null);
}
