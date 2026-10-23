import { prisma } from "@invytra/db";
import { readFile } from "node:fs/promises";
import { requireUser } from "@/lib/auth";
import { evidenceFile } from "@/lib/evidence";

export const dynamic = "force-dynamic";

/** The screenshot taken when one of this workspace's actions failed. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const action = await prisma.action.findFirst({
    where: { id: String(id), account: { workspaceId: me.workspace.id } },
    select: { screenshotPath: true },
  });
  const file = evidenceFile(action?.screenshotPath ?? null);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await readFile(file)), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
}
