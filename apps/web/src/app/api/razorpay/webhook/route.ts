import { prisma } from "@invytra/db";
import { NextResponse } from "next/server";
import { handleRazorpayWebhook } from "@/lib/billing";

/** Razorpay tells us a payment went through (set this URL and its secret in Razorpay's dashboard). */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await handleRazorpayWebhook(prisma, raw, req.headers.get("x-razorpay-signature") ?? "");
  return ok ? NextResponse.json({ ok: true }) : new NextResponse("Bad signature", { status: 400 });
}
