import { prisma } from "@invytra/db";
import { requireUser } from "@/lib/auth";
import { dncCsv } from "@/lib/do-not-contact";

/** The workspace's do-not-contact list as a CSV download. */
export async function GET() {
  const me = await requireUser();
  return new Response(await dncCsv(prisma, me.workspace.id), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="do-not-contact.csv"', "cache-control": "no-store" },
  });
}
