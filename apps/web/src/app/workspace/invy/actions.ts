"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { channelHref } from "@/lib/domains";
import { deleteSearch, emailBusinesses, followUp, renameSearch, saveBusinesses, startSearch, unsaveBusiness } from "@/lib/invy";

const id = z.string().min(1).max(40);
const ids = z.array(id).max(500);
const text = z.string().max(2000);
const done = (r: Result<unknown>) => {
  if (r.ok) revalidatePath("/", "layout");
  return r;
};

export async function startSearchAction(message: unknown): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  return done(await startSearch(prisma, me.workspace.id, me.user.id, text.parse(message))) as Result<{ id: string }>;
}

export async function followUpAction(searchId: unknown, message: unknown): Promise<Result> {
  const me = await requireUser();
  return done(await followUp(prisma, me.workspace.id, id.parse(searchId), text.parse(message))) as Result;
}

export async function renameSearchAction(searchId: unknown, title: unknown): Promise<Result> {
  const me = await requireUser();
  return done(await renameSearch(prisma, me.workspace.id, id.parse(searchId), text.parse(title))) as Result;
}

export async function deleteSearchAction(searchId: unknown): Promise<Result> {
  const me = await requireUser();
  return done(await deleteSearch(prisma, me.workspace.id, id.parse(searchId))) as Result;
}

export async function saveBusinessesAction(searchId: unknown, businessIds: unknown): Promise<Result<number>> {
  const me = await requireUser();
  return done(await saveBusinesses(prisma, me.workspace.id, id.parse(searchId), ids.parse(businessIds))) as Result<number>;
}

export async function unsaveBusinessAction(prospectId: unknown): Promise<Result> {
  const me = await requireUser();
  return done(await unsaveBusiness(prisma, me.workspace.id, id.parse(prospectId))) as Result;
}

/** A draft email campaign with the chosen businesses that have an email; opens it to write and review. */
export async function emailBusinessesAction(searchId: unknown, businessIds: unknown): Promise<Result<{ href: string; added: number; noEmail: number }>> {
  const me = await requireUser();
  const r = await emailBusinesses(prisma, me.workspace.id, id.parse(searchId), ids.parse(businessIds));
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, value: { href: channelHref("email", `/email/campaigns/${r.value.campaignId}`), added: r.value.added, noEmail: r.value.noEmail } };
}
