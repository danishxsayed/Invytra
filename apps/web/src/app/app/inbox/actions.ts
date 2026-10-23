"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { setDone } from "@/lib/inbox";

export async function setDoneAction(ids: unknown, done: boolean): Promise<Result<number>> {
  const me = await requireUser();
  if (!Array.isArray(ids) || !ids.every((i) => typeof i === "string")) return { ok: false, error: "Nothing selected." };
  const r = await setDone(prisma, me.workspace.id, ids as string[], !!done);
  revalidatePath("/app", "layout");
  return r;
}
