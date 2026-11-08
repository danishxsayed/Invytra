"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { addVoice, listVoices, removeVoice, tryVoice } from "@/lib/voices";

/** Makes a voice copy from a recording (FormData: name, consent, sample). */
export async function addVoiceAction(form: FormData): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const sample = form.get("sample");
  if (!(sample instanceof File)) return { ok: false, error: "Record or upload your voice first." };
  const r = await addVoice(prisma, me.workspace.id, me.user.id, {
    name: z.string().max(80).parse(form.get("name") ?? ""),
    consent: form.get("consent") === "yes",
    sample: { data: Buffer.from(await sample.arrayBuffer()), name: sample.name || "sample.webm", type: sample.type || "audio/webm" },
  });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function removeVoiceAction(id: unknown): Promise<Result> {
  const me = await requireUser();
  const r = await removeVoice(prisma, me.workspace.id, z.string().min(1).max(40).parse(id));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function tryVoiceAction(id: unknown, text: unknown): Promise<Result<{ audio: string }>> {
  const me = await requireUser();
  return tryVoice(prisma, me.workspace.id, z.string().min(1).max(40).parse(id), z.string().max(1000).parse(text));
}

/** The workspace's voices, for the voice note picker in sequence steps. */
export async function myVoicesAction(): Promise<{ voices: { id: string; name: string }[]; manage: string }> {
  const me = await requireUser();
  return { voices: (await listVoices(prisma, me.workspace.id)).map((v) => ({ id: v.id, name: v.name })), manage: hubHref("/voices") };
}
