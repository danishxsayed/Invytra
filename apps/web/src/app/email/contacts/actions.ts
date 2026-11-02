"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import {
  addSuppressions,
  contactImportSchema,
  createVariable,
  deleteContacts,
  deleteList,
  deleteVariable,
  importContacts,
  removeSuppression,
  requestVerification,
  CONTACT_FILTERS,
  setSubscribed,
  updateVariableFallback,
  variableSchema,
  type ContactImportResult,
} from "@/lib/email-contacts";
import { cancelVerifyOrder, orderVerifyPack } from "@/lib/verify-credits";

/* Contacts, lists, variables and the suppression list: Email channel only, own workspace only. */

const ws = async () => (await requireChannel("email")).workspace.id;
const done = <T>(r: Result<T>) => (revalidatePath("/email", "layout"), r);
const id = z.string().min(1).max(40);

export async function importContactsAction(input: unknown): Promise<Result<ContactImportResult>> {
  const w = await ws();
  const p = contactImportSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  return done(await importContacts(prisma, w, p.data));
}

export async function deleteListAction(listId: string): Promise<Result> {
  return done(await deleteList(prisma, await ws(), id.parse(listId)));
}

export async function deleteContactsAction(ids: unknown): Promise<Result<number>> {
  const w = await ws();
  const p = z.array(id).max(1000).safeParse(ids);
  if (!p.success) return { ok: false, error: "Choose contacts." };
  return done(await deleteContacts(prisma, w, p.data));
}

export async function setSubscribedAction(contactId: string, subscribed: boolean): Promise<Result> {
  return done(await setSubscribed(prisma, await ws(), id.parse(contactId), subscribed === true));
}

export async function createVariableAction(input: unknown): Promise<Result<{ key: string }>> {
  const w = await ws();
  const p = variableSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  return done(await createVariable(prisma, w, p.data));
}

export async function updateVariableFallbackAction(variableId: string, fallback: unknown): Promise<Result> {
  const w = await ws();
  const p = z.string().trim().max(200).safeParse(fallback);
  if (!p.success) return { ok: false, error: "At most 200 characters." };
  return done(await updateVariableFallback(prisma, w, id.parse(variableId), p.data));
}

export async function deleteVariableAction(variableId: string): Promise<Result> {
  return done(await deleteVariable(prisma, await ws(), id.parse(variableId)));
}

export async function addSuppressionsAction(text: unknown): Promise<Result<{ added: number; invalid: number }>> {
  const w = await ws();
  const p = z.string().min(1, "Enter addresses or domains.").max(200_000).safeParse(text);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  return done(await addSuppressions(prisma, w, p.data));
}

export async function removeSuppressionAction(suppressionId: string): Promise<Result> {
  return done(await removeSuppression(prisma, await ws(), id.parse(suppressionId)));
}

export async function requestVerificationAction(scope: unknown): Promise<Result<number>> {
  const w = await ws();
  const p = z.object({ listId: z.string().max(40).optional(), filter: z.enum(CONTACT_FILTERS).optional(), q: z.string().max(200).optional() }).safeParse(scope ?? {});
  if (!p.success) return { ok: false, error: "Choose contacts to verify." };
  return done(await requestVerification(prisma, w, p.data));
}

export async function orderVerifyPackAction(packId: unknown): Promise<Result<{ id: string; credits: number; priceCents: number }>> {
  const me = await requireChannel("email");
  return done(await orderVerifyPack(prisma, me.workspace.id, me.user.id, z.string().max(10).parse(packId)));
}
export async function cancelVerifyOrderAction(orderId: string): Promise<Result> {
  return done(await cancelVerifyOrder(prisma, await ws(), id.parse(orderId)));
}
