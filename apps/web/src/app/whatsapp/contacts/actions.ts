"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { addWaContact, deleteWaContacts, importWaContacts, optOutWaContacts, tagWaContacts, type WaImportResult } from "@/lib/whatsapp-contacts";

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
