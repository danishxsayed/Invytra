"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { addDnc, removeDnc, type AddDncResult } from "@/lib/do-not-contact";

export async function addDncAction(text: unknown, note: unknown): Promise<Result<AddDncResult>> {
  const me = await requireUser();
  const r = await addDnc(prisma, me.workspace.id, me.user.id, z.string().max(200_000).parse(text), z.string().max(200).optional().parse(note ?? undefined));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function removeDncAction(ids: unknown): Promise<Result<number>> {
  const me = await requireUser();
  const r = await removeDnc(prisma, me.workspace.id, z.array(z.string().min(1).max(40)).max(500).parse(ids));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
