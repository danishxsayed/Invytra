"use server";

import { prisma } from "@invytra/db";
import { redirect } from "next/navigation";
import { unsubscribeByToken } from "@/lib/unsubscribe";

export async function confirmUnsubscribeAction(token: string): Promise<void> {
  await unsubscribeByToken(prisma, String(token).slice(0, 100), "Clicked the unsubscribe link");
  redirect(`/unsubscribe/${encodeURIComponent(token)}?done=1`);
}
