import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { AccountNotFoundError } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { syncUnipileAccount } from "@/lib/unipile";
import { channelOrigin } from "@/lib/domains";

export const dynamic = "force-dynamic";

/**
 * Unipile sends the person back here after its login page. Checks the login with Unipile
 * (nothing in the link is trusted) and returns to the account page with the result.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireChannel("linkedin");
  const { id } = await params;
  const back = new URL(`/app/accounts/${encodeURIComponent(String(id))}`, channelOrigin("linkedin") || process.env.WEB_ORIGIN || req.url);
  if (new URL(req.url).searchParams.get("failed")) {
    back.searchParams.set("connect_error", "unfinished");
    return goTo(back);
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
  return goTo(back);
}

/**
 * The login runs in a window inside the dashboard, so this page loads inside it: send the
 * whole dashboard (not just that window) to the account page.
 */
function goTo(url: URL): Response {
  const target = JSON.stringify(url.pathname + url.search).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><title>Connecting…</title><script>(window.top||window).location.replace(${target});</script><noscript><a href="${url.pathname + url.search}">Continue</a></noscript>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
