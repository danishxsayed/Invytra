import { prisma } from "@invytra/db";
import { redirect } from "next/navigation";
import { requireChannel } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** WhatsApp's front door: connect a number first, then templates. */
export default async function WhatsappHome() {
  const me = await requireChannel("whatsapp");
  const n = await prisma.whatsappNumber.count({ where: { workspaceId: me.workspace.id } });
  redirect(n ? "/whatsapp/templates" : "/whatsapp/number");
}
