"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { confirmCheckout, saveBillingProfile, startPackCheckout, type Checkout } from "@/lib/billing";
import { cancelVerifyOrder } from "@/lib/verify-credits";
import { canSeeBilling } from "@/lib/workspace-nav";

const NOT_OWNER = { ok: false as const, error: "Only the workspace owner can manage billing and buy credits." };

async function owner() {
  const me = await requireUser();
  return canSeeBilling(me) ? me : null;
}

export async function saveBillingProfileAction(input: unknown): Promise<Result> {
  const me = await owner();
  if (!me) return NOT_OWNER;
  const r = await saveBillingProfile(prisma, me.workspace.id, input);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Starts buying a credit pack (Razorpay checkout, or an order the team completes when Razorpay isn't set up). */
export async function startCheckoutAction(packId: unknown): Promise<Result<Checkout & { prefill: { name: string; email: string } }>> {
  const me = await owner();
  if (!me) return NOT_OWNER;
  const r = await startPackCheckout(prisma, me.workspace.id, me.user.id, z.string().max(10).parse(packId));
  if (r.ok) revalidatePath("/", "layout");
  return r.ok ? { ok: true, value: { ...r.value, prefill: { name: me.user.name, email: me.user.email } } } : r;
}

const confirmSchema = z.object({ purchaseId: z.string().min(1).max(40), orderId: z.string().min(1).max(60), paymentId: z.string().min(1).max(60), signature: z.string().min(1).max(200) });

export async function confirmCheckoutAction(input: unknown): Promise<Result<{ credits: number }>> {
  const me = await owner();
  if (!me) return NOT_OWNER;
  const r = await confirmCheckout(prisma, me.workspace.id, confirmSchema.parse(input));
  revalidatePath("/", "layout");
  return r;
}

export async function cancelCreditOrderAction(orderId: unknown): Promise<Result> {
  const me = await owner();
  if (!me) return NOT_OWNER;
  const r = await cancelVerifyOrder(prisma, me.workspace.id, z.string().min(1).max(40).parse(orderId));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
