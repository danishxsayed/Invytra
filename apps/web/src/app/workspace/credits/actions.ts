"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { cancelVerifyOrder, orderVerifyPack } from "@/lib/verify-credits";

/** Orders an extra credit pack (verification or AI) for the signed-in workspace. */
export async function orderCreditPackAction(packId: unknown): Promise<Result<{ id: string; credits: number; priceCents: number }>> {
  const me = await requireUser();
  const r = await orderVerifyPack(prisma, me.workspace.id, me.user.id, z.string().max(10).parse(packId));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function cancelCreditOrderAction(orderId: string): Promise<Result> {
  const me = await requireUser();
  const r = await cancelVerifyOrder(prisma, me.workspace.id, z.string().min(1).max(40).parse(orderId));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
