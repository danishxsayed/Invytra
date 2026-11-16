import { prisma } from "@invytra/db";
import { requireChannel } from "@/lib/auth";
import { whatsappPulse } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Polled by every WhatsApp page (a plain fetch, outside Next's router): unread chats, last message in, bell count. */
export async function GET() {
  const me = await requireChannel("whatsapp");
  return Response.json(await whatsappPulse(prisma, me.workspace.id, me.user.id), { headers: { "cache-control": "no-store" } });
}
