import { prisma } from "@invytra/db";
import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/unsubscribe";

/**
 * One-click unsubscribe (RFC 8058): mail providers POST here when someone presses their own
 * "Unsubscribe" button. A GET (someone opening the address) goes to the page instead.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await unsubscribeByToken(prisma, token, "One-click unsubscribe");
  return new NextResponse(ok ? "Unsubscribed" : "Unknown link", { status: ok ? 200 : 404 });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/unsubscribe/${encodeURIComponent(token)}`, req.url), 303);
}
