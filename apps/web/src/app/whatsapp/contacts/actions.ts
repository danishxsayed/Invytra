"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { addWaContact, deleteWaContacts, deleteWaTags, importWaContacts, optOutWaContacts, renameWaTag, tagWaContacts, type WaImportResult } from "@/lib/whatsapp-contacts";
import { deleteSegments, previewSegment, renameSegment, saveSegment } from "@/lib/whatsapp-segments";

/* WhatsApp contacts: each action checks the WhatsApp channel and only touches the user's workspace. */

const done = <T,>(r: Result<T>) => {
  revalidatePath("/whatsapp/contacts");
  return r;
};

export async function addWaContactAction(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireChannel("whatsapp");
  return done(await addWaContact(prisma, me.workspace.id, me.user.name, input));
}

export async function importWaContactsAction(input: unknown): Promise<Result<WaImportResult>> {
  const me = await requireChannel("whatsapp");
  return done(await importWaContacts(prisma, me.workspace.id, me.user.name, input));
}

export async function tagWaContactsAction(ids: unknown, tag: string, add: boolean): Promise<Result<number>> {
  const me = await requireChannel("whatsapp");
  return done(await tagWaContacts(prisma, me.workspace.id, ids, String(tag), !!add));
}

export async function optOutWaContactsAction(ids: unknown): Promise<Result<number>> {
  const me = await requireChannel("whatsapp");
  return done(await optOutWaContacts(prisma, me.workspace.id, ids, { id: me.user.id, name: me.user.name }));
}

export async function deleteWaContactsAction(ids: unknown): Promise<Result<number>> {
  const me = await requireChannel("whatsapp");
  return done(await deleteWaContacts(prisma, me.workspace.id, ids));
}

export async function renameWaTagAction(from: string, to: string): Promise<Result<number>> {
  const me = await requireChannel("whatsapp");
  return done(await renameWaTag(prisma, me.workspace.id, String(from), String(to)));
}

export async function deleteWaTagsAction(tags: unknown): Promise<Result<number>> {
  const me = await requireChannel("whatsapp");
  return done(await deleteWaTags(prisma, me.workspace.id, tags));
}

export async function previewSegmentAction(input: unknown) {
  const me = await requireChannel("whatsapp");
  return previewSegment(prisma, me.workspace.id, input);
}

export async function saveSegmentAction(id: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireChannel("whatsapp");
  return done(await saveSegment(prisma, me.workspace.id, id ? String(id) : null, input));
}

export async function renameSegmentAction(id: string, name: string): Promise<Result> {
  const me = await requireChannel("whatsapp");
  return done(await renameSegment(prisma, me.workspace.id, String(id), String(name)));
}

export async function deleteSegmentsAction(ids: unknown): Promise<Result<number>> {
  const me = await requireChannel("whatsapp");
  return done(await deleteSegments(prisma, me.workspace.id, ids));
}
