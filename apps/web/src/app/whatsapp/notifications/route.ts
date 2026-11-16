import { prisma } from "@invytra/db";
import { z } from "zod";
import { requireChannel } from "@/lib/auth";
import { NOTIFICATION_TABS, listNotifications, markNotificationsRead, type NotificationTab } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** The bell's list for the signed-in teammate (?tab=MENTION…). */
export async function GET(req: Request) {
  const me = await requireChannel("whatsapp");
  const tab = new URL(req.url).searchParams.get("tab") ?? "all";
  const t: NotificationTab = (NOTIFICATION_TABS as readonly string[]).includes(tab) ? (tab as NotificationTab) : "all";
  return Response.json(await listNotifications(prisma, me.workspace.id, me.user.id, t), { headers: { "cache-control": "no-store" } });
}

const body = z.object({ ids: z.array(z.string().max(40)).max(100).optional() });

/** Mark read: { ids } for some, {} for all. Only ever the signed-in teammate's own. */
export async function POST(req: Request) {
  // Only from our own pages (a JSON POST from another site is already blocked by CORS; this is belt and braces).
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return Response.json({ ok: false }, { status: 403 });
  const me = await requireChannel("whatsapp");
  const p = body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return Response.json({ ok: false }, { status: 400 });
  const n = await markNotificationsRead(prisma, me.workspace.id, me.user.id, p.data.ids);
  return Response.json({ ok: true, marked: n });
}
