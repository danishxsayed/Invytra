import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { AccountNotFoundError } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { syncUnipileAccount } from "@/lib/unipile";

export const dynamic = "force-dynamic";

/**
 * Unipile sends the person back here after its login page. Checks the login with Unipile
 * (nothing in the link is trusted) and returns to the account page with the result.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const back = new URL(`/app/accounts/${encodeURIComponent(String(id))}`, process.env.WEB_ORIGIN ?? req.url);
  if (new URL(req.url).searchParams.get("failed")) {
    back.searchParams.set("connect_error", "unfinished");
    return Response.redirect(back, 303);
  }
  try {
    const r = await syncUnipileAccount(prisma, me.workspace.id, String(id));
    if (r.ok) back.searchParams.set("connected", "1");
    else back.searchParams.set("connect_error", r.code);
  } catch (e) {
    if (e instanceof AccountNotFoundError) return new Response("Not found", { status: 404 });
    console.error("Unipile sync failed:", e instanceof Error ? e.message : e);
    back.searchParams.set("connect_error", "unavailable");
  }
  revalidatePath("/app", "layout");
  return Response.redirect(back, 303);
}
