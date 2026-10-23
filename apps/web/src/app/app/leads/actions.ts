"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import {
  LeadListNotFoundError,
  deleteList,
  importLeads,
  importSchema,
  removeLeads,
  renameList,
  type ImportSummary,
} from "@/lib/leads";

/* Every action re-reads the signed-in user; list ids from the browser are checked in lib/leads. */

async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof LeadListNotFoundError) return { ok: false, error: e.message };
    throw e;
  }
}

function refresh(listId?: string) {
  revalidatePath("/app", "layout");
  if (listId) revalidatePath(`/app/leads/${listId}`);
}

export async function importLeadsAction(input: unknown): Promise<Result<ImportSummary>> {
  const me = await requireUser();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const r = await guarded(() => importLeads(prisma, me.workspace.id, parsed.data));
  if (r.ok) refresh(r.value.listId);
  return r;
}

export async function renameListAction(listId: string, name: string): Promise<Result> {
  const me = await requireUser();
  const r = await guarded(() => renameList(prisma, me.workspace.id, String(listId), String(name)));
  if (r.ok) refresh(listId);
  return r;
}

export async function deleteListAction(listId: string): Promise<Result> {
  const me = await requireUser();
  const r = await guarded(() => deleteList(prisma, me.workspace.id, String(listId)));
  if (r.ok) refresh();
  return r;
}

export async function removeLeadsAction(listId: string, ids: unknown): Promise<Result<number>> {
  const me = await requireUser();
  if (!Array.isArray(ids) || !ids.every((i) => typeof i === "string")) return { ok: false, error: "Nothing selected." };
  const r = await guarded(() => removeLeads(prisma, me.workspace.id, String(listId), ids as string[]));
  if (r.ok) refresh(listId);
  return r;
}
