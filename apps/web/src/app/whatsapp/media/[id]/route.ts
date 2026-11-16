import { prisma } from "@invytra/db";
import { requireChannel } from "@/lib/auth";
import { clientFor, deps } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** A chat's photo, video, voice note or document, fetched from Meta for a signed-in teammate. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireChannel("whatsapp");
  const { id } = await params;
  const m = await prisma.whatsappMessage.findFirst({ where: { id, workspaceId: me.workspace.id, mediaId: { not: null } }, select: { mediaId: true, mediaType: true, fileName: true } });
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId: me.workspace.id } });
  const d = deps();
  if (!m || !n || !d.app) return new Response("Not found", { status: 404 });
  try {
    const f = await clientFor(n, d).downloadMedia(m.mediaId!);
    const type = m.mediaType || f.type;
    const inline = /^(image|video|audio)\//.test(type) || type === "application/pdf";
    const name = (m.fileName || "file").replace(/["\\\r\n]/g, "");
    return new Response(f.bytes, {
      headers: { "content-type": type, "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("This file isn't available any more (Meta keeps files for 30 days).", { status: 410 });
  }
}
